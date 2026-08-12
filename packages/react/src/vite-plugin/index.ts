import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Plugin } from 'vite';
import { generateCssForToken, type RuleEntry } from './wasmNode';
import { extractClassStrings, scanDir } from './scan';
import { formatKbachCSS, writeKbachToFile } from './format';
import { scanProjectCssSelectors, warnIfUnknownClass } from './unknownClassWarnings';
import { defaultTheme } from '../theme';
import type { ThemeConfig } from '../theme';

export interface KbachPluginOptions {
  /** Defaults to the same defaultTheme the runtime uses — pass your own to keep both in sync. */
  theme?: ThemeConfig;
  /** Directories to scan for class strings (relative to Vite root). */
  include?: string[];
  /**
   * Class names to always include in the generated kbach.css, even if no
   * scan finds them literally in your source — for dynamically-built class
   * strings static extraction can't see (e.g. `` `bg-${color}-6` ``). Same
   * purpose as Tailwind's `safelist`.
   */
  safelist?: string[];
}

const DEFAULT_SCAN_DIRS = ['src', 'app', 'pages', 'components'];

// Safelist entries live under a key no real file path can ever normalize to
// (a NUL-prefixed string), so they participate in the "active = union of
// every fileTokens entry" logic automatically, with zero special-casing
// elsewhere — same permanence as a file that's always present, never
// edited/deleted, so the add/unlink/edit handlers (which only ever touch
// keys derived from real file paths) can never prune it.
const SAFELIST_KEY = '\0kbach-safelist';

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

function writeFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8');
}

/**
 * Build-time static CSS generation for Vite — scans source files for
 * Kbach class strings, resolves them through the same Rust engine the
 * runtime uses (via the Node-target WASM build, see wasmNode.ts), and
 * writes a real kbach.css. Simplified vs old-kbach's version: expects
 * `src/kbach.css` to exist at a fixed conventional path (create it with
 * `/* kbach:start *\/` / `/* kbach:end *\/` markers) rather than scanning
 * the whole project for a file named kbach.css.
 */
export function kbach(options: KbachPluginOptions = {}): Plugin {
  const theme = options.theme ?? defaultTheme;
  const themeJson = JSON.stringify(theme);
  const includeDirs = options.include ?? DEFAULT_SCAN_DIRS;
  const safelist = options.safelist ?? [];

  let root = process.cwd();

  // fileTokens: file path (or SAFELIST_KEY) -> tokens that entry contributes.
  // tokenRules: token -> resolved rules (cached, never regenerated unless new).
  const fileTokens = new Map<string, Set<string>>();
  const tokenRules = new Map<string, RuleEntry[]>();

  // Populated once at buildStart (before the JS/TSX scan, so the unknown-
  // class check has the full picture) — see unknownClassWarnings.ts.
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
        warnIfUnknownClass(tok, filePath, rules.length > 0, projectCssClasses, warnedTokens);
      }
    }
    fileTokens.set(filePath, tokens);
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

  function generateCSS(): string {
    const active = activeTokens();
    const view = new Map<string, RuleEntry[]>();
    for (const tok of active) {
      const rules = tokenRules.get(tok);
      if (rules) view.set(tok, rules);
    }
    return formatKbachCSS(view, theme);
  }

  function mainCSSFile(): string {
    return join(root, 'src', 'kbach.css');
  }

  function syncMainCSSFile(server?: { watcher: { emit(event: string, ...args: unknown[]): unknown } }): void {
    const active = activeTokens();
    for (const tok of tokenRules.keys()) {
      if (!active.has(tok)) tokenRules.delete(tok);
    }
    const changed = writeKbachToFile(mainCSSFile(), generateCSS(), readFile, writeFile);
    if (changed && server) server.watcher.emit('change', mainCSSFile());
  }

  function initialScan(): void {
    for (const dir of includeDirs) {
      scanDir(join(root, dir), processFile);
    }
  }

  return {
    name: 'kbach',
    enforce: 'pre',

    configResolved(resolved) {
      root = resolved.root;
    },

    buildStart() {
      // Index project stylesheets BEFORE scanning JS/TSX — the unknown-
      // utility check needs the full picture of what's already styled
      // elsewhere, not a partial one.
      projectCssClasses = scanProjectCssSelectors(root, includeDirs);
      initialScan();
      processSafelist();
      writeKbachToFile(mainCSSFile(), generateCSS(), readFile, writeFile);
    },

    // handleHotUpdate covers edits; add/unlink (create/delete) land on the
    // raw watcher instead — Vite's handleHotUpdate hook only fires for
    // type === "update".
    configureServer(server) {
      const onAddOrUnlink = (file: string, isUnlink: boolean) => {
        if (file.includes('node_modules')) return;
        if (!/\.(tsx?|jsx?)$/.test(file)) return;
        if (isUnlink) {
          fileTokens.delete(file);
        } else {
          try {
            processFile(file, readFile(file));
          } catch {
            fileTokens.delete(file);
          }
        }
        syncMainCSSFile(server);
      };
      server.watcher.on('add', (file) => onAddOrUnlink(file, false));
      server.watcher.on('unlink', (file) => onAddOrUnlink(file, true));
    },

    handleHotUpdate({ file, server }) {
      if (file.includes('node_modules')) return;
      if (!/\.(tsx?|jsx?)$/.test(file)) return;
      try {
        processFile(file, readFile(file));
      } catch {
        fileTokens.delete(file);
      }
      syncMainCSSFile(server);
    },
  };
}
