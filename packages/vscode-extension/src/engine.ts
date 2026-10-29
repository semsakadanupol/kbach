import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THEME } from './defaultTheme';
import { findProjectRoot } from './projectRoot';
import { loadConfigFile } from './kbachConfigLoader';
import { resolveKbachConfig } from './kbachConfigResolve';

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

export const DEFAULT_THEME_JSON = JSON.stringify(DEFAULT_THEME);

interface GenerateCssResult {
  className: string;
  rules: { rule: string; order: number }[];
}

/**
 * Per-project-root resolved theme JSON cache (see `resolveThemeJsonForDir`
 * below) — `loadConfigFile` + `resolveKbachConfig` do real disk I/O and a
 * `require()`/`import()` of a whole JS file; not something to redo on
 * every hover/completion/diagnostics pass. `undefined` would collide with
 * "not yet looked up" if stored directly, so absence from the map IS "not
 * yet looked up" and every lookup (including the no-config case) always
 * stores a real string.
 */
const themeJsonCache = new Map<string, string>();

/** Drops a cached theme for `root` — called when that project's `kbach.config.*` is saved, so the next resolution re-reads it instead of serving a stale cached value indefinitely. */
export function invalidateThemeJsonForRoot(root: string): void {
  themeJsonCache.delete(root);
}

/** Forces `root`'s cached theme to `json` directly — used to cache a fallback (the default theme) after a `kbach.config.js` load failure, so a broken config doesn't get re-attempted (and re-warned about) on every single keystroke until the next save. */
export function setThemeJsonForRoot(root: string, json: string): void {
  themeJsonCache.set(root, json);
}

/**
 * Resolves the effective theme JSON for a document living under
 * `startDir` — `DEFAULT_THEME_JSON` if `startDir` isn't inside a
 * recognizable project (no ancestor `package.json`) or that project has
 * no `kbach.config.*` of its own; otherwise the real `kbach.config.*`
 * merged over `DEFAULT_THEME` via the same algorithm `@kbach/react`'s own
 * `resolveKbachConfig` uses (see kbachConfigResolve.ts's top comment).
 * Cached per project root — see `themeJsonCache`'s own comment.
 *
 * Can reject (a genuine error loading/evaluating the config file, e.g. a
 * syntax error) — deliberately NOT swallowed here, so the caller (which
 * has access to `vscode.window` to actually surface it) decides how to
 * degrade, rather than this module silently guessing.
 */
export async function resolveThemeJsonForDir(startDir: string): Promise<string> {
  const root = findProjectRoot(startDir);
  if (!root) return DEFAULT_THEME_JSON;
  const cached = themeJsonCache.get(root);
  if (cached !== undefined) return cached;

  const config = await loadConfigFile(root);
  const themeJson = config ? JSON.stringify(resolveKbachConfig(config, DEFAULT_THEME)) : DEFAULT_THEME_JSON;
  themeJsonCache.set(root, themeJson);
  return themeJson;
}

/**
 * Resolves a single class token against the real engine — the same
 * source of truth every other Kbach surface (the Vite/PostCSS plugins,
 * the native resolvers) uses, so there's no second "is this valid"
 * opinion to drift out of sync. An empty `rules` array means the engine
 * genuinely doesn't recognize it (unknown utility, or a value shape it
 * rejects) — the exact same signal the build-time "Unknown class ...
 * Typo?" warning is built on, just surfaced here at edit time instead.
 *
 * `themeJson` defaults to the built-in default theme — every existing
 * caller (tests, `generate-vocabulary.mjs`'s own separate copy of this
 * same call shape) that doesn't care about a project's own
 * `kbach.config.js` keeps working unchanged; a caller that DOES care
 * (extension.ts's providers) passes the result of
 * `resolveThemeJsonForDir` explicitly.
 */
export function resolveToken(token: string, themeJson: string = DEFAULT_THEME_JSON): GenerateCssResult {
  const json = generate_css(token, themeJson);
  try {
    return JSON.parse(json) as GenerateCssResult;
  } catch {
    return { className: token, rules: [] };
  }
}

export function isKnownToken(token: string, themeJson: string = DEFAULT_THEME_JSON): boolean {
  return resolveToken(token, themeJson).rules.length > 0;
}

/** The resolved CSS declaration(s) for a token, joined for display — e.g. `padding: 16px`. */
export function describeToken(token: string, themeJson: string = DEFAULT_THEME_JSON): string | null {
  const result = resolveToken(token, themeJson);
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
