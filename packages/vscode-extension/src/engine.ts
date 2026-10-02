import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PALETTE } from './generatedPalette';

/**
 * NOT `require('@kbach/core-engine/node')` — that resolves, inside this
 * monorepo, via an npm WORKSPACE SYMLINK straight to the sibling
 * `packages/core-engine` source directory, confirmed live
 * (`require.resolve` pointed at `packages/core-engine/dist-node/...`,
 * not any real `node_modules` copy). That's fine for running tests
 * inside the workspace, but once this extension is packaged into a
 * `.vsix` for an actual install, that symlink target doesn't exist at
 * all — the extension installed completely silently broken, confirmed
 * live (a real install + a real test file produced zero completions,
 * zero hover, zero diagnostics; `getDiagnostics` showed nothing ran).
 *
 * `scripts/copy-engine.mjs` instead copies the Node-target WASM build's
 * actual files (`kbach_core_engine.js` + its `.wasm`) directly into this
 * package's own `dist/`, alongside the bundled `extension.js` — same
 * "vendor it, don't depend on a live resolution" treatment
 * `@kbach/react-native` already gives this exact engine, for the exact
 * same class of reason (see root AGENTS.md §8). The path is built at
 * RUNTIME via `__dirname` (not a string literal `require()` can
 * statically see) specifically so esbuild/tsup's bundler can't try to
 * inline the glue file into `extension.js` — that glue file does its
 * OWN `__dirname`-relative lookup for the `.wasm` binary, which bundling
 * into a different file/location would break, same reasoning
 * `tsup.config.ts`'s own `external` list uses for the package-name case.
 *
 * Falls back to the workspace-symlinked package name when the vendored
 * copy isn't there yet — exactly the case for tests run against `src/`
 * directly (vitest, no build step), where it's correct to resolve via
 * the monorepo's own workspace linking rather than a copy that only
 * `npm run build` produces.
 */
const vendoredPath = join(__dirname, 'kbach_core_engine.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generate_css } = require(existsSync(vendoredPath) ? vendoredPath : '@kbach/core-engine/node') as {
  generate_css(classString: string, themeJson: string): string;
};

const THEME_JSON = JSON.stringify({
  colors: PALETTE,
  spacing: {},
  screens: { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
  darkMode: 'media',
  container: {},
});

interface GenerateCssResult {
  className: string;
  rules: { rule: string; order: number }[];
}

/**
 * Resolves a single class token against the real engine — the same
 * source of truth every other Kbach surface (the Vite/PostCSS plugins,
 * the native resolvers) uses, so there's no second "is this valid"
 * opinion to drift out of sync. An empty `rules` array means the engine
 * genuinely doesn't recognize it (unknown utility, or a value shape it
 * rejects) — the exact same signal the build-time "Unknown class ...
 * Typo?" warning is built on, just surfaced here at edit time instead.
 */
export function resolveToken(token: string): GenerateCssResult {
  const json = generate_css(token, THEME_JSON);
  try {
    return JSON.parse(json) as GenerateCssResult;
  } catch {
    return { className: token, rules: [] };
  }
}

export function isKnownToken(token: string): boolean {
  return resolveToken(token).rules.length > 0;
}

/** The resolved CSS declaration(s) for a token, joined for display — e.g. `padding: 16px`. */
export function describeToken(token: string): string | null {
  const result = resolveToken(token);
  if (result.rules.length === 0) return null;
  return result.rules
    .map((r) => {
      // Strip the outer `.class { ... }`/`@media (...) { .class { ... } }`
      // wrapper down to just the innermost declaration body — a hover
      // card wants "padding: 16px", not the full selector-wrapped rule
      // text. A $-anchored regex looks right but is WRONG for a
      // modifier-wrapped rule (`dark:`/`sm:`/...): the actual end of the
      // string is the WRAPPER's own closing brace, not the declaration
      // block's — confirmed live, that anchored version returns null for
      // every modifier-wrapped rule. Taking the LAST of every innermost
      // `{...}` pair (never crossing nested braces, so it can't ever
      // match a wrapper's own pair) works regardless of nesting depth.
      const matches = [...r.rule.matchAll(/\{([^{}]*)\}/g)];
      const last = matches[matches.length - 1];
      return last ? last[1]!.trim() : r.rule;
    })
    .join('; ');
}
