import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { createRequire } from 'module';
import type { Plugin } from 'vite';
import { writeKbachToFile } from './format';
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
   * resolved root. Defaults to `"src/kbach.css"` — override this for any
   * project whose source root isn't `src/`: React Router v7's framework
   * mode (`app/kbach.css`), a Pages-Router-style Next.js app using this
   * plugin directly (`styles/kbach.css`), or any other convention. Getting
   * this wrong fails loudly at build start (`ENOENT` writing the file's
   * parent directory) rather than silently generating nothing, but it's
   * still worth setting explicitly if your project doesn't use `src/`.
   */
  cssFile?: string;
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
 * writes a real kbach.css. Simplified vs old-kbach's version: expects a
 * marker file to already exist at a fixed conventional path — `src/
 * kbach.css` by default, override via `cssFile` for any other source root
 * (create it with `/* kbach:start *\/` / `/* kbach:end *\/` markers)
 * rather than scanning the whole project for a file named kbach.css.
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

  function mainCSSFile(): string {
    return join(root, options.cssFile ?? 'src/kbach.css');
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
    const changed = writeKbachToFile(mainCSSFile(), engine.generateCSS(), readSourceFile, (p, c) => writeFileSync(p, c, 'utf-8'));
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
    },

    buildStart() {
      // Index project stylesheets BEFORE scanning JS/TSX — the unknown-
      // utility check needs the full picture of what's already styled
      // elsewhere, not a partial one.
      engine.scanProjectCssSelectorsOnce();
      engine.initialScan();
      engine.processSafelist();
      writeKbachToFile(mainCSSFile(), engine.generateCSS(), readSourceFile, (p, c) => writeFileSync(p, c, 'utf-8'));
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
