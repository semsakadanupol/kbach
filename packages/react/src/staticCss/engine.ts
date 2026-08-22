// Bundler-agnostic core of Kbach's static CSS generation — scans source
// files for class strings, resolves them through the Rust engine (Node
// target), and produces the final kbach.css text. Extracted out of
// vite-plugin/index.ts so postcss-plugin/index.ts (Next.js/webpack/
// Turbopack — no Vite involved at all) can reuse the EXACT same scanning/
// resolution/generation logic instead of re-deriving it — every function
// here already only touches `fs`/regex/the WASM engine, never a Vite API,
// so this was always bundler-agnostic in practice, just not factored out
// as its own module until Next.js support needed a second caller.
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateCssForToken, type RuleEntry } from '../vite-plugin/wasmNode';
import { extractClassStrings, scanUsedTags, scanDir } from '../vite-plugin/scan';
import { formatKbachCSS } from '../vite-plugin/format';
import { scanProjectCssSelectors, warnIfUnknownClass } from '../vite-plugin/unknownClassWarnings';
import type { ThemeConfig } from '../theme';

export interface KbachStaticCssEngineOptions {
  root: string;
  theme: ThemeConfig;
  themeJson: string;
  /** Directories to scan for class strings, relative to `root`. */
  includeDirs: string[];
  /** Always-included class names — see KbachPluginOptions.safelist's own doc comment (vite-plugin/index.ts). */
  safelist: string[];
}

export interface KbachStaticCssEngine {
  /** Re-scans `filePath`'s tokens/tags, replacing whatever it previously contributed. */
  processFile(filePath: string, code: string): void;
  /** Drops everything `filePath` previously contributed (a delete/unlink). */
  removeFile(filePath: string): void;
  /** Walks every configured include dir once, calling `processFile` for each matched source file. */
  initialScan(): void;
  /** Resolves and registers every safelisted class name, once. */
  processSafelist(): void;
  /** Assembles the current kbach.css body from every file's (still-active) tokens. */
  generateCSS(): string;
  /** Populates the project-stylesheet index `processFile`'s unknown-class check reads — call once, before the first `processFile`/`initialScan`. */
  scanProjectCssSelectorsOnce(): void;
}

// Normalizes a file path to forward slashes (and lowercase on Windows,
// whose filesystem is case-insensitive) so the internal per-file Maps' keys
// are consistent regardless of which of two different path styles produced
// them — Node's `path.join` (OS-native separators) vs. a bundler's own
// watcher event convention (forward-slash, on every OS, e.g. Vite's).
// Without this, a re-scanned file gets a SECOND, different Map entry
// instead of replacing its original one, so its old tokens are never
// pruned and silently keep reappearing in the generated CSS forever.
function normPath(p: string): string {
  const fwd = p.replace(/\\/g, '/');
  return process.platform === 'win32' ? fwd.toLowerCase() : fwd;
}

// Safelist entries live under a key no real file path can ever normalize to
// (a NUL-prefixed string), so they participate in the "active = union of
// every fileTokens entry" logic automatically, with zero special-casing
// elsewhere — same permanence as a file that's always present, never
// edited/deleted, so `removeFile` (which only ever touches keys derived
// from real file paths) can never prune it.
const SAFELIST_KEY = '\0kbach-safelist';

export function createKbachStaticCssEngine(options: KbachStaticCssEngineOptions): KbachStaticCssEngine {
  const { root, theme, themeJson, includeDirs, safelist } = options;

  // fileTokens: file path (or SAFELIST_KEY) -> tokens that entry contributes.
  // tokenRules: token -> resolved rules (cached, never regenerated unless new).
  const fileTokens = new Map<string, Set<string>>();
  const tokenRules = new Map<string, RuleEntry[]>();

  // fileTags: file path -> HTML tags that file's JSX renders — drives the
  // base reset's tag-based pruning (see reset.ts's buildResetCSS).
  const fileTags = new Map<string, Set<string>>();

  let projectCssClasses = new Set<string>();
  const warnedTokens = new Set<string>();

  function resolveToken(tok: string): RuleEntry[] {
    if (!tokenRules.has(tok)) {
      tokenRules.set(tok, generateCssForToken(tok, themeJson).rules);
    }
    return tokenRules.get(tok)!;
  }

  function processFile(filePath: string, code: string): void {
    const tokens = new Set<string>();
    for (const tok of extractClassStrings(code)) {
      tokens.add(tok);
      const rules = resolveToken(tok);
      if (process.env.NODE_ENV !== 'production') {
        warnIfUnknownClass(tok, filePath, code, rules.length > 0, projectCssClasses, warnedTokens);
      }
    }
    fileTokens.set(normPath(filePath), tokens);
    fileTags.set(normPath(filePath), scanUsedTags(code));
  }

  function removeFile(filePath: string): void {
    fileTokens.delete(normPath(filePath));
    fileTags.delete(normPath(filePath));
  }

  function processSafelist(): void {
    if (safelist.length === 0) return;
    const tokens = new Set(safelist);
    for (const tok of tokens) resolveToken(tok);
    fileTokens.set(SAFELIST_KEY, tokens);
  }

  function activeTokens(): Set<string> {
    const active = new Set<string>();
    for (const tokens of fileTokens.values()) for (const t of tokens) active.add(t);
    return active;
  }

  function activeTags(): Set<string> {
    const active = new Set<string>();
    for (const tags of fileTags.values()) for (const t of tags) active.add(t);
    return active;
  }

  function generateCSS(): string {
    const active = activeTokens();
    const view = new Map<string, RuleEntry[]>();
    for (const tok of active) {
      const rules = tokenRules.get(tok);
      if (rules) view.set(tok, rules);
    }
    // Prune tokens no longer referenced by any active file — keeps
    // tokenRules from growing unboundedly across a long dev session, and
    // matches vite-plugin's own pre-generate prune (see its own doc note).
    for (const tok of tokenRules.keys()) {
      if (!active.has(tok)) tokenRules.delete(tok);
    }
    return formatKbachCSS(view, theme, activeTags());
  }

  function initialScan(): void {
    for (const dir of includeDirs) {
      scanDir(join(root, dir), processFile);
    }
  }

  function scanProjectCssSelectorsOnce(): void {
    projectCssClasses = scanProjectCssSelectors(root, includeDirs);
  }

  return { processFile, removeFile, initialScan, processSafelist, generateCSS, scanProjectCssSelectorsOnce };
}

/** Re-exported so callers (postcss-plugin, vite-plugin) don't need their own `fs` import just to read a file before handing it to `processFile`. */
export function readSourceFile(path: string): string {
  return readFileSync(path, 'utf-8');
}
