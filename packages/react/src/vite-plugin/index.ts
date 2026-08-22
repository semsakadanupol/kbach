import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import type { Plugin } from 'vite';
import { writeKbachToFile, KBACH_START, KBACH_END } from './format';
import { buildClassTokens, buildClassNameHintsDts } from './classNameHints';
import { defaultTheme } from '../theme';
import type { ThemeConfig } from '../theme';
import { resolveKbachConfig } from '../config';
import type { KbachConfig } from '../config';
import { createKbachStaticCssEngine, readSourceFile, type KbachStaticCssEngine } from '../staticCss/engine';

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
  /**
   * Path to the `kbach:start`/`kbach:end` marker file, relative to Vite's
   * resolved root. Not needed for the common case — `kbach()` auto-detects
   * it (see `findMainCSSFile`'s own doc comment) by finding wherever you
   * actually put the two marker comments, regardless of whether your
   * project's source root is `src/`, `app/` (React Router v7's framework
   * mode), or anything else in `include`. Set this explicitly only to
   * disambiguate a genuinely unusual layout (a marker file outside every
   * `include` directory, or more than one candidate present at once).
   */
  cssFile?: string;
}

/**
 * Finds where to read/write the `kbach:start`/`kbach:end` marker file,
 * with no configuration required for the common case:
 *
 * 1. An explicit `cssFile` always wins (the one supported escape hatch).
 * 2. Otherwise, look for a `kbach.css` already containing BOTH markers in
 *    each `include` directory (in order) and the project root itself —
 *    wherever you actually created it is where this plugin keeps using it,
 *    regardless of which framework convention (`src/`, `app/`, ...) that
 *    is. This is what makes React Router v7's framework mode (`app/
 *    kbach.css`) and a plain Vite app (`src/kbach.css`) both "just work"
 *    with the exact same `kbach()` call — no per-framework option needed.
 * 3. No marked file exists yet (first run in a fresh project) — pick the
 *    first `include` directory that already exists as a real directory on
 *    disk, so the file this plugin is about to CREATE lands somewhere that
 *    won't need its own parent directory made up out of nothing.
 * 4. Nothing in `include` exists yet either (a genuinely empty project,
 *    scaffolded before its first source file) — fall back to the first
 *    configured `include` entry regardless; `writeMainCSSFile` (below)
 *    creates its parent directory unconditionally, so this never crashes
 *    even here.
 */
export function findMainCSSFile(root: string, includeDirs: string[], explicitCssFile?: string): string {
  if (explicitCssFile) return join(root, explicitCssFile);

  const searchDirs = [...includeDirs, '.'];
  for (const dir of searchDirs) {
    const candidate = join(root, dir, 'kbach.css');
    if (!existsSync(candidate)) continue;
    try {
      const content = readFileSync(candidate, 'utf-8');
      if (content.includes(KBACH_START) && content.includes(KBACH_END)) return candidate;
    } catch {
      // Unreadable — not a valid candidate, keep looking.
    }
  }

  for (const dir of includeDirs) {
    const full = join(root, dir);
    try {
      if (statSync(full).isDirectory()) return join(full, 'kbach.css');
    } catch {
      // Doesn't exist — not this one.
    }
  }

  return join(root, includeDirs[0] ?? 'src', 'kbach.css');
}

export const DEFAULT_SCAN_DIRS = ['src', 'app', 'pages', 'components'];

// A bulk change (git checkout/branch switch/rebase touching many files)
// fires one add/unlink/handleHotUpdate event per file in quick succession —
// without batching, each one independently re-walks every active token
// (generateCSS) and does a full kbach.css read+diff+write (writeKbachToFile),
// so N changed files means N full recomputations instead of one. Exported so
// tests can advance fake timers by exactly this amount rather than
// duplicating the constant.
export const CSS_SYNC_DEBOUNCE_MS = 50;

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
export function loadConfigFile(root: string): KbachConfig | undefined {
  const path = join(root, 'kbach.config.js');
  if (!existsSync(path)) return undefined;
  const mod = createRequire(root)(path) as { default?: KbachConfig };
  return (mod.default ?? mod) as KbachConfig;
}

/**
 * Resolves the theme to use, applying the same "explicit theme/config
 * always wins over kbach.config.js auto-discovery" precedence both
 * vite-plugin and postcss-plugin need identically.
 */
export function resolveEffectiveTheme(root: string, options: { theme?: ThemeConfig; config?: KbachConfig }): ThemeConfig {
  if (options.theme) return options.theme;
  if (options.config) return resolveKbachConfig(options.config);
  const discovered = loadConfigFile(root);
  return discovered ? resolveKbachConfig(discovered) : defaultTheme;
}

/**
 * Build-time static CSS generation for Vite — scans source files for
 * Kbach class strings, resolves them through the same Rust engine the
 * runtime uses (via the Node-target WASM build, see wasmNode.ts), and
 * writes a real kbach.css. Auto-detects WHERE that file is (or should be
 * created) via `findMainCSSFile` — no per-framework config needed for
 * `src/`, `app/` (React Router v7's framework mode), or any other
 * `include` convention; create a file with `/* kbach:start *\/` / `/*
 * kbach:end *\/` markers wherever your project's source actually lives
 * and this plugin finds it there.
 *
 * The actual scanning/resolution/generation logic lives in
 * `staticCss/engine.ts`, shared with `postcss-plugin/index.ts` (Next.js/
 * webpack/Turbopack) — this file is now just the Vite-specific wiring:
 * plugin lifecycle hooks, the dev-server watcher, and the debounced
 * file-write.
 */
export function kbach(options: KbachPluginOptions = {}): Plugin {
  const includeDirs = options.include ?? DEFAULT_SCAN_DIRS;
  const safelist = options.safelist ?? [];

  // Placeholders, good enough for anything that (incorrectly) ran before
  // configResolved — real resolution happens there instead, once Vite's
  // actual project root is known; `process.cwd()` is only a rough guess
  // until then.
  let root = process.cwd();
  let theme = defaultTheme;
  let engine: KbachStaticCssEngine = createKbachStaticCssEngine({ root, theme, themeJson: JSON.stringify(theme), includeDirs, safelist });
  // Resolved once in configResolved (see findMainCSSFile) and reused for
  // the rest of this plugin instance's lifetime — a mid-session filesystem
  // scan on every single write would be wasteful, and re-detecting after
  // the first write could theoretically land on a DIFFERENT file if a
  // second marked candidate showed up mid-session, which would be far more
  // surprising than just committing to whatever was found first.
  let mainCSSFilePath = join(root, 'src', 'kbach.css');

  function mainCSSFile(): string {
    return mainCSSFilePath;
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
    const changed = writeKbachToFile(mainCSSFile(), engine.generateCSS(), readSourceFile, writeFileEnsuringDir);
    if (changed && server) server.watcher.emit('change', mainCSSFile());
  }

  // Coalesces same-tick/near-simultaneous events into a single
  // syncMainCSSFile call, trailing-edge — each new event pushes the sync
  // out rather than running immediately, so a burst settles to exactly one
  // recompute+write after CSS_SYNC_DEBOUNCE_MS of quiet, not one per file.
  // The engine's own per-file Maps are still updated synchronously per
  // event (cheap, and needed so a later event in the same burst sees prior
  // events' results) — only the expensive generateCSS+write is deferred.
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSync(server?: Parameters<typeof syncMainCSSFile>[0]): void {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncMainCSSFile(server);
    }, CSS_SYNC_DEBOUNCE_MS);
  }

  return {
    name: 'kbach',
    enforce: 'pre',

    configResolved(resolved) {
      root = resolved.root;
      theme = resolveEffectiveTheme(root, options);
      engine = createKbachStaticCssEngine({ root, theme, themeJson: JSON.stringify(theme), includeDirs, safelist });
      mainCSSFilePath = findMainCSSFile(root, includeDirs, options.cssFile);
    },

    buildStart() {
      // Index project stylesheets BEFORE scanning JS/TSX — the unknown-
      // utility check needs the full picture of what's already styled
      // elsewhere, not a partial one.
      engine.scanProjectCssSelectorsOnce();
      engine.initialScan();
      engine.processSafelist();
      writeKbachToFile(mainCSSFile(), engine.generateCSS(), readSourceFile, writeFileEnsuringDir);
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
          engine.removeFile(file);
        } else {
          try {
            engine.processFile(file, readSourceFile(file));
          } catch {
            engine.removeFile(file);
          }
        }
        scheduleSync(server);
      };
      server.watcher.on('add', (file) => onAddOrUnlink(file, false));
      server.watcher.on('unlink', (file) => onAddOrUnlink(file, true));
    },

    handleHotUpdate({ file, server }) {
      if (file.includes('node_modules')) return;
      if (!/\.(tsx?|jsx?)$/.test(file)) return;
      try {
        engine.processFile(file, readSourceFile(file));
      } catch {
        engine.removeFile(file);
      }
      scheduleSync(server);
    },
  };
}
