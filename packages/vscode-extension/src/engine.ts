import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THEME, WEB_DEFAULT_THEME, type EngineTheme } from './defaultTheme';
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
const { generate_css, suggest_class } = require(existsSync(vendoredPath) ? vendoredPath : '@kbach/core-engine/node') as {
  generate_css(classString: string, themeJson: string): string;
  suggest_class?(token: string, themeJson: string): string;
};

export const DEFAULT_THEME_JSON = JSON.stringify(DEFAULT_THEME);
const WEB_DEFAULT_THEME_JSON = JSON.stringify(WEB_DEFAULT_THEME);

interface GenerateCssResult {
  className: string;
  rules: { rule: string; order: number }[];
}

/**
 * Which binding's default theme a project root resolves against when its
 * `kbach.config.*` doesn't replace `theme.colors` — `WEB_DEFAULT_THEME`
 * (adds `@kbach/react`'s extra `surface` color) for a project that
 * depends on `@kbach/react` and NOT `@kbach/react-native` (an Expo Web
 * app runs on the native binding's defaults even in a browser);
 * `DEFAULT_THEME` for everything else, including no readable package.json.
 */
function baseThemeForRoot(root: string): { theme: EngineTheme; json: string } {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    if (deps['@kbach/react'] && !deps['@kbach/react-native']) return { theme: WEB_DEFAULT_THEME, json: WEB_DEFAULT_THEME_JSON };
  } catch {
    // unreadable/malformed package.json — the binding-agnostic default is the safe answer
  }
  return { theme: DEFAULT_THEME, json: DEFAULT_THEME_JSON };
}

/**
 * Per-project-root resolved theme cache (see `resolveThemeJsonForDir`
 * below) — `loadConfigFile` + `resolveKbachConfig` do real disk I/O and a
 * `require()`/`import()` of a whole JS file; not something to redo on
 * every hover/completion/diagnostics pass.
 *
 * Holds the PROMISE, not the finished string, deliberately:
 * - Opening a file fires diagnostics, the color provider and often hover
 *   at once — all three missing a string-only cache simultaneously would
 *   each load the config separately (and, for an ESM config, each leave
 *   another `?t=`-busted module instance in memory for the session).
 * - `invalidateThemeJsonForRoot` just drops the map entry. A load that
 *   was still in flight when the file was saved resolves only for the
 *   callers already awaiting it — it can never write its now-stale result
 *   back into the cache after the invalidation, which a "set the string
 *   when done" cache would.
 */
const themeJsonCache = new Map<string, Promise<string>>();

/** Drops a cached theme for `root` — called when that project's `kbach.config.*` (or a file it loads, or its package.json) changes, so the next resolution re-reads it instead of serving a stale cached value indefinitely. */
export function invalidateThemeJsonForRoot(root: string): void {
  themeJsonCache.delete(root);
}

async function loadThemeJson(root: string): Promise<string> {
  const base = baseThemeForRoot(root);
  const config = await loadConfigFile(root);
  return config ? JSON.stringify(resolveKbachConfig(config, base.theme)) : base.json;
}

/**
 * Resolves the effective theme JSON for a document living under
 * `startDir` — `DEFAULT_THEME_JSON` if `startDir` isn't inside a
 * recognizable project (no ancestor `package.json`); that project's
 * binding default (`baseThemeForRoot`) if it has no `kbach.config.*` of
 * its own; otherwise the real `kbach.config.*` merged over that default
 * via the same algorithm `@kbach/react`'s own `resolveKbachConfig` uses
 * (see kbachConfigResolve.ts's top comment). Cached per project root —
 * see `themeJsonCache`'s own comment.
 *
 * Rejects on a genuine error loading/evaluating the config file (e.g. a
 * syntax error) — deliberately NOT swallowed here, so the caller (which
 * has access to `vscode.window` to actually surface it) decides how to
 * tell the user. Only the caller(s) awaiting THAT load see the rejection:
 * the cache entry is swapped for the root's default theme, so a broken
 * config isn't re-attempted (and re-reported) on every keystroke until
 * the next invalidation.
 */
export function resolveThemeJsonForDir(startDir: string): Promise<string> {
  const root = findProjectRoot(startDir);
  if (!root) return Promise.resolve(DEFAULT_THEME_JSON);
  const cached = themeJsonCache.get(root);
  if (cached !== undefined) return cached;

  const pending = loadThemeJson(root);
  themeJsonCache.set(root, pending);
  pending.catch(() => {
    // Only if nothing invalidated (and re-started) this root in the meantime.
    if (themeJsonCache.get(root) === pending) themeJsonCache.set(root, Promise.resolve(baseThemeForRoot(root).json));
  });
  return pending;
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
  if (isMarkerClass(token)) return true;
  if (resolveToken(token, themeJson).rules.length > 0) return true;
  // A light/dark theme color compiles through its CSS variable in the
  // static build (@kbach/react's withColorVariables), which covers every
  // color utility; the per-mode class expansion a plain engine
  // call falls back to doesn't (`ring-line`, `decoration-accent/40` came
  // back empty and were underlined). Only tried when the first check fails.
  const viaVariables = withColorVariablesJson(themeJson);
  return viaVariables !== themeJson && resolveToken(token, viaVariables).rules.length > 0;
}

/**
 * `group`/`peer`, or a named one (`group/sidebar`, `peer/field`): markers
 * that `group-*`/`peer-*` variants look for, with no CSS of their own.
 * Mirrors @kbach/react's unknownClassWarnings.ts `isMarkerClass`.
 */
function isMarkerClass(token: string): boolean {
  const base = token.split(':').pop() ?? token;
  const slash = base.lastIndexOf('/');
  const name = slash === -1 ? base : base.slice(0, slash);
  return (name === 'group' || name === 'peer') && (slash === -1 || slash < base.length - 1);
}

const variableThemeCache = new Map<string, string>();

/**
 * The theme JSON with each light/dark hex color replaced by
 * `rgb(var(--kb-color-<name>))`, the form @kbach/react's static build
 * hands the engine (colorVariables.ts `withColorVariables`). Same JSON
 * back when there are none. Memoized per theme string.
 */
function withColorVariablesJson(themeJson: string): string {
  const cached = variableThemeCache.get(themeJson);
  if (cached !== undefined) return cached;
  const hex = (v: unknown) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  let result = themeJson;
  try {
    const theme = JSON.parse(themeJson) as { colors?: Record<string, unknown> };
    let changed = false;
    for (const [name, value] of Object.entries(theme.colors ?? {})) {
      const pair = value as { light?: unknown; dark?: unknown } | string;
      if (typeof pair === 'object' && pair !== null && hex(pair.light) && hex(pair.dark)) {
        theme.colors![name] = 'rgb(var(--kb-color-' + name + '))';
        changed = true;
      }
    }
    if (changed) result = JSON.stringify(theme);
  } catch {
    // not JSON: leave it
  }
  if (variableThemeCache.size > 20) variableThemeCache.clear();
  variableThemeCache.set(themeJson, result);
  return result;
}

/**
 * The engine's own "did you mean" for an unknown class (core-engine's
 * suggest.rs): a Tailwind CSS shade mapped to Kbach's (`bg-blue-500` ->
 * `bg-blue-6`), else a one-edit typo fix checked against the real resolver
 * and the project's theme. `null` when there's none, or when the vendored
 * engine predates the export (core-engine < 1.0.0-beta.18).
 */
export function suggestFromEngine(token: string, themeJson: string = DEFAULT_THEME_JSON): string | null {
  return suggest_class?.(token, themeJson) || null;
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
