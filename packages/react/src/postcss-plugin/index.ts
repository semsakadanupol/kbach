/**
 * Static CSS generation for any PostCSS-driven build — Next.js (webpack
 * AND Turbopack both run PostCSS for CSS files, so one plugin covers both),
 * CRA/webpack, or any other non-Vite bundler that already runs PostCSS.
 * Same generated output as `vite-plugin/index.ts` (shares its scanning/
 * resolution/generation core, `staticCss/engine.ts`) — this file is only
 * the PostCSS-specific wiring, the counterpart to vite-plugin's Vite-
 * specific wiring.
 *
 * Unlike the Vite plugin (a long-lived dev-server instance that tracks
 * per-file state incrementally across `add`/`unlink`/`handleHotUpdate`
 * events), this does a full, stateless rescan on every invocation: a fresh
 * `createKbachStaticCssEngine` per `Once()` call, no Map state carried
 * across builds. PostCSS/webpack/Turbopack give no equivalent long-lived
 * "dev server instance with a real-time watcher" API a plugin can hook
 * into directly the way Vite's `configureServer` does — and this repo has
 * no way to verify whether a plugin module's own closures reliably survive
 * across incremental rebuilds under Turbopack specifically (a completely
 * separate, Rust-based build engine from webpack, with its own caching
 * model) — so full-rescan-every-time is the correct default: slower per
 * rebuild than Vite's incremental approach, but never at risk of serving
 * stale state from a previous build that turned out not to persist.
 */
import postcss from 'postcss';
import type { Plugin as PostcssPlugin, Root, ChildNode, Comment } from 'postcss';
import { resolve as resolvePath } from 'path';
import { createKbachStaticCssEngine } from '../staticCss/engine';
import { resolveEffectiveTheme, DEFAULT_SCAN_DIRS } from '../vite-plugin/index';
import type { ThemeConfig } from '../theme';
import type { KbachConfig } from '../config';

export interface KbachPostcssPluginOptions {
  /**
   * Project root to scan from. Defaults to `process.cwd()` — correct for
   * the common case (PostCSS/Next.js run from the project root), but pass
   * this explicitly if your `postcss.config.js` lives somewhere else, or
   * from a monorepo app whose cwd differs from where `src`/`app` actually
   * live.
   */
  root?: string;
  /** Same as `KbachPluginOptions.theme` (vite-plugin/index.ts) — see its own doc comment. */
  theme?: ThemeConfig;
  /** Same as `KbachPluginOptions.config`. */
  config?: KbachConfig;
  /** Directories to scan for class strings, relative to `root`. Defaults to the same set the Vite plugin uses. */
  include?: string[];
  /** Same as `KbachPluginOptions.safelist`. */
  safelist?: string[];
}

const KBACH_START_TEXT = 'kbach:start';
const KBACH_END_TEXT = 'kbach:end';

function isKbachMarker(node: ChildNode | undefined, text: string): node is Comment {
  return !!node && node.type === 'comment' && node.text === text;
}

/**
 * Replaces everything between the `/* kbach:start *\/`/`/* kbach:end *\/`
 * marker comments in `root` (this file's own top-level nodes — same
 * marker convention `format.ts`'s `writeKbachToFile` uses for the Vite
 * plugin, so a project's `kbach.css` looks and works identically either
 * way) with freshly parsed nodes from `generatedCss`. A no-op (with a
 * one-time console warning, not a thrown error — a misconfigured/missing
 * marker shouldn't fail an entire build) if either marker is missing.
 */
function spliceGeneratedCss(root: Root, generatedCss: string): void {
  const nodes = root.nodes;
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < nodes.length; i++) {
    if (startIdx === -1 && isKbachMarker(nodes[i], KBACH_START_TEXT)) {
      startIdx = i;
      continue;
    }
    if (startIdx !== -1 && isKbachMarker(nodes[i], KBACH_END_TEXT)) {
      endIdx = i;
      break;
    }
  }
  if (startIdx === -1 || endIdx === -1) {
    // eslint-disable-next-line no-console
    console.warn(
      '[kbach] postcss plugin: no "/* kbach:start */" / "/* kbach:end */" marker pair found — add both to the file this plugin processes (see @kbach/react/vite\'s own convention). Nothing was generated.',
    );
    return;
  }

  for (const stale of nodes.slice(startIdx + 1, endIdx)) stale.remove();

  const parsed = postcss.parse(generatedCss);
  const newNodes: ChildNode[] = [...parsed.nodes]; // snapshot — reparenting below mutates parsed.nodes in place
  let after: ChildNode = nodes[startIdx]!;
  for (const node of newNodes) {
    root.insertAfter(after, node);
    after = node;
  }
}

/**
 * `postcss.config.js`:
 * ```js
 * module.exports = { plugins: { '@kbach/react/postcss': {} } };
 * ```
 * Processes whichever CSS file carries the `kbach:start`/`kbach:end`
 * markers (conventionally `app/globals.css`/`src/kbach.css` — the same
 * file you'd `@import`/reference like any other global stylesheet).
 */
export default function kbachPostcss(options: KbachPostcssPluginOptions = {}): PostcssPlugin {
  return {
    postcssPlugin: 'kbach',
    Once(root, { result }) {
      const projectRoot = options.root ?? process.cwd();
      const theme = resolveEffectiveTheme(projectRoot, options);
      const includeDirs = options.include ?? DEFAULT_SCAN_DIRS;
      const safelist = options.safelist ?? [];

      const engine = createKbachStaticCssEngine({
        root: projectRoot,
        theme,
        themeJson: JSON.stringify(theme),
        includeDirs,
        safelist,
      });
      engine.scanProjectCssSelectorsOnce();
      engine.initialScan();
      engine.processSafelist();

      // Tells the bundler's watcher this CSS output depends on every file
      // under each scanned directory, not just this CSS file itself —
      // without this, editing an unrelated .tsx file wouldn't trigger a
      // rebuild of the generated CSS at all in dev mode. `dir-dependency`
      // is a real, established postcss-loader convention (both webpack's
      // and Turbopack's Next.js CSS pipelines honor it) — the same
      // mechanism real Tailwind's own PostCSS plugin relies on.
      for (const dir of includeDirs) {
        result.messages.push({
          type: 'dir-dependency',
          plugin: 'kbach',
          dir: resolvePath(projectRoot, dir),
          glob: '**/*',
        });
      }

      spliceGeneratedCss(root, engine.generateCSS());
    },
  };
}

kbachPostcss.postcss = true;
