import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import type { Plugin } from 'vite';
import { generateCssForToken, type RuleEntry } from './wasmNode';
import { extractClassStrings, scanUsedTags, scanDir } from './scan';
import { formatKbachCSS, writeKbachToFile } from './format';
import { scanProjectCssSelectors, warnIfUnknownClass } from './unknownClassWarnings';
import { buildClassTokens, buildClassNameHintsDts } from './classNameHints';
import { defaultTheme } from '../theme';
import type { ThemeConfig } from '../theme';
import { resolveKbachConfig } from '../config';
import type { KbachConfig } from '../config';

export interface KbachPluginOptions {
  /** Defaults to the same defaultTheme the runtime uses — pass your own to keep both in sync. */
  theme?: ThemeConfig;
  /**
   * A `kbach.config.js`-style config object, resolved the same way
   * `applyKbachConfig()` resolves it for the runtime — import the SAME
   * config file here and in your app's own `applyKbachConfig()` call, and
   * build-time CSS generation and runtime resolution always agree, with no
   * synchronization step needed (`resolveKbachConfig` is a pure function:
   * same input, same output, in Node.js here and in the browser there).
   * Ignored if `theme` is also supplied. Only needed for an explicit
   * override, though — if BOTH this and `theme` are omitted, `kbach()`
   * auto-discovers a `kbach.config.js` at the project root on its own (see
   * `loadConfigFile`'s own doc comment), the same zero-config convenience
   * `tailwind.config.js` gets from Tailwind's own PostCSS plugin.
   */
  config?: KbachConfig;
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

// Normalizes a file path to forward slashes (and lowercase on Windows,
// whose filesystem is case-insensitive) so `fileTokens`'s keys are
// consistent regardless of which of two different path styles produced
// them: `scanDir`'s initial scan uses Node's `path.join`, which emits
// OS-native separators — backslashes on Windows — while Vite's own
// `handleHotUpdate`/`watcher` events always report forward-slash absolute
// paths, on every OS, by Vite's own convention. Without this, a hot-edited
// file gets a SECOND, different Map entry instead of replacing its
// original one — its old tokens are never pruned, so `kbach.css` slowly
// accumulates every class the file has EVER contained, live, forever, and
// no rebuild fixes it short of restarting the dev server. (Confirmed by
// hand: this is exactly why a shadow color that had already been edited
// out of the source kept reappearing in the generated CSS.) Only used for
// the Map key — the display path passed to `warnIfUnknownClass` is left
// as-is, since raw-cased/native-separator paths read better in a warning.
function normPath(p: string): string {
  const fwd = p.replace(/\\/g, '/');
  return process.platform === 'win32' ? fwd.toLowerCase() : fwd;
}

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

function writeFileEnsuringDir(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

/**
 * Auto-discovers `kbach.config.js` at the project root — `undefined` if it
 * doesn't exist (the common case: most projects have no customization at
 * all, so this is a silent, expected no-op, not a warning).
 *
 * Uses `require()` (a real project's `kbach.config.js` is plain CommonJS,
 * `module.exports = {...}`, matching every example in this package's own
 * README), built via `createRequire(root)` rather than
 * `createRequire(import.meta.url)` — this file is written as ESM source,
 * but tsup's CJS build output has no real `import.meta.url` (esbuild
 * leaves it `undefined` there), which would make `createRequire` throw for
 * anyone consuming this package's `require('@kbach/react/vite')` entry.
 * `root` works as `createRequire`'s base in either build: it's always an
 * absolute, already-`existsSync`-validated-by-caller directory, and
 * `require()` given `path` (itself already absolute) doesn't consult the
 * base for resolution anyway — the base only matters for a RELATIVE
 * specifier, which this never passes it.
 */
function loadConfigFile(root: string): KbachConfig | undefined {
  const path = join(root, 'kbach.config.js');
  if (!existsSync(path)) return undefined;
  const mod = createRequire(root)(path) as { default?: KbachConfig };
  return (mod.default ?? mod) as KbachConfig;
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
  // Placeholder, good enough for anything that (incorrectly) ran before
  // configResolved — real resolution (including auto-discovery) happens
  // there instead, once Vite's actual project root is known; `process.cwd()`
  // is only a rough guess until then, same as `root` below always was.
  let theme = options.theme ?? (options.config ? resolveKbachConfig(options.config) : defaultTheme);
  let themeJson = JSON.stringify(theme);
  const includeDirs = options.include ?? DEFAULT_SCAN_DIRS;
  const safelist = options.safelist ?? [];

  let root = process.cwd();

  // fileTokens: file path (or SAFELIST_KEY) -> tokens that entry contributes.
  // tokenRules: token -> resolved rules (cached, never regenerated unless new).
  const fileTokens = new Map<string, Set<string>>();
  const tokenRules = new Map<string, RuleEntry[]>();

  // fileTags: file path -> HTML tags that file's JSX renders — drives the
  // base reset's tag-based pruning (see reset.ts's buildResetCSS). Same
  // per-file-Map shape as fileTokens/normPath keying, for the same reason:
  // a file's contribution needs to be independently replaceable/removable
  // on hot-update or delete without touching any other file's entries.
  const fileTags = new Map<string, Set<string>>();

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
        warnIfUnknownClass(tok, filePath, code, rules.length > 0, projectCssClasses, warnedTokens);
      }
    }
    fileTokens.set(normPath(filePath), tokens);
    fileTags.set(normPath(filePath), scanUsedTags(code));
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
    return formatKbachCSS(view, theme, activeTags());
  }

  function mainCSSFile(): string {
    return join(root, 'src', 'kbach.css');
  }

  // Lives in a dot-prefixed project-root folder, not next to real source —
  // it's a generated, do-not-edit tooling artifact (like .vite/.turbo
  // elsewhere in this monorepo), not something that should clutter the
  // visible file tree next to the user's own files. Consuming apps add
  // ".kbach" to their tsconfig's "include" so TS still picks it up, and can
  // hide it from their editor's file explorer (e.g. VS Code's
  // files.exclude) without affecting compilation — that's a view-only
  // concern, unrelated to whether the language service reads the file.
  function classNameHintsFile(): string {
    return join(root, '.kbach', 'kbach-classnames.d.ts');
  }

  // Depends only on the theme, not on which classes are used in source —
  // unlike kbach.css, this never needs regenerating from handleHotUpdate/
  // configureServer's per-file-edit handlers, only once at startup.
  function writeClassNameHints(): void {
    const dts = buildClassNameHintsDts(buildClassTokens(theme));
    writeFileEnsuringDir(classNameHintsFile(), dts);
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
      // Only when the caller specified NEITHER `theme` NOR `config` —
      // either one is an explicit choice that always wins over
      // auto-discovery, same as `config`'s own doc comment already
      // promises relative to `theme`.
      if (!options.theme && !options.config) {
        const discovered = loadConfigFile(root);
        if (discovered) {
          theme = resolveKbachConfig(discovered);
          themeJson = JSON.stringify(theme);
        }
      }
    },

    buildStart() {
      // Index project stylesheets BEFORE scanning JS/TSX — the unknown-
      // utility check needs the full picture of what's already styled
      // elsewhere, not a partial one.
      projectCssClasses = scanProjectCssSelectors(root, includeDirs);
      initialScan();
      processSafelist();
      writeKbachToFile(mainCSSFile(), generateCSS(), readFile, writeFile);
      writeClassNameHints();
    },

    // handleHotUpdate covers edits; add/unlink (create/delete) land on the
    // raw watcher instead — Vite's handleHotUpdate hook only fires for
    // type === "update".
    configureServer(server) {
      const onAddOrUnlink = (file: string, isUnlink: boolean) => {
        if (file.includes('node_modules')) return;
        if (!/\.(tsx?|jsx?)$/.test(file)) return;
        if (isUnlink) {
          fileTokens.delete(normPath(file));
          fileTags.delete(normPath(file));
        } else {
          try {
            processFile(file, readFile(file));
          } catch {
            fileTokens.delete(normPath(file));
            fileTags.delete(normPath(file));
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
        fileTokens.delete(normPath(file));
        fileTags.delete(normPath(file));
      }
      syncMainCSSFile(server);
    },
  };
}
