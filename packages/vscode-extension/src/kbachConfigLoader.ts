import { existsSync } from 'node:fs';
import { join, normalize, relative, isAbsolute, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { KbachConfig } from './kbachConfigResolve';

/**
 * Faithful port of `@kbach/react`'s own `loadConfigFile`
 * (packages/react/src/vite-plugin/index.ts) — same three-filename
 * precedence, same require()-then-import()-fallback handling for a bare
 * `.js` whose actual module format depends on the nearest package.json's
 * `"type"` field. See `kbachConfigResolve.ts`'s own top comment for why
 * this is a port rather than an import.
 */
function isEsmRequireFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  // ERR_REQUIRE_ASYNC_MODULE: Node 22.12+'s require(esm) CAN load a plain
  // ESM file synchronously now, but not one with top-level `await` —
  // still a perfectly valid ESM config that a real import() loads fine.
  // DIVERGES from the @kbach/react original here on purpose (that one
  // only checks the first two), since an editor's extension host is far
  // more likely to be on a current Node than a pinned build toolchain.
  return code === 'ERR_REQUIRE_ESM' || code === 'ERR_REQUIRE_ASYNC_MODULE' || /is not defined in ES module scope/.test(err.message);
}

/** Case-insensitive on Windows, where `require.cache` keys and VS Code's own `uri.fsPath` can disagree on drive-letter case. */
function pathKey(p: string): string {
  const n = normalize(p);
  return process.platform === 'win32' ? n.toLowerCase() : n;
}

/** A file inside `root`'s own source tree — not outside it, and not anything under a `node_modules`. */
function isProjectLocalFile(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('node_modules');
}

/**
 * Every project-local file a root's config pulled in on its last load —
 * the config itself, plus (CommonJS only) every `require()`d helper
 * (`./tokens.js`, `./colors.json`) — keyed by `pathKey(root)`. Two jobs:
 * `requireConfigModule` evicts exactly these from `require.cache` before
 * a reload (so an edited helper isn't served from cache even after the
 * config is re-read), and `rootsDependingOn` lets the extension invalidate
 * a root's theme when one of these files changes, not only the config
 * file itself.
 *
 * ESM children (an `.mjs` config's own `import './tokens.js'`) can't be
 * tracked or evicted — Node's ESM loader exposes no module graph and no
 * cache eviction, and the `?t=` cache-bust below only applies to the
 * top-level specifier. A known limit, documented in AGENTS.md §6.
 */
const configDependencies = new Map<string, { root: string; files: Set<string> }>();

/** Every project root whose last-loaded config depends on `file` (see `configDependencies`). */
export function rootsDependingOn(file: string): string[] {
  const key = pathKey(file);
  const roots: string[] = [];
  for (const { root, files } of configDependencies.values()) {
    if (files.has(key)) roots.push(root);
  }
  return roots;
}

// Both loaders deliberately defeat Node's own module cache — unlike the
// one-shot build tool this was ported from (a fresh process every run,
// where require()'s/import()'s caching is invisible), this extension's
// host process stays alive for the whole editor session. Our OWN
// `themeJsonCache` (engine.ts) is what decides WHEN to re-read a config
// file at all (on cache miss / explicit invalidation after a save) — by
// the time either function below runs, that decision is already made, so
// a STALE module cache entry for the same path would silently serve the
// file's PREVIOUS contents forever after the first load, defeating the
// whole point of invalidating on save. Confirmed live: a regression test
// that writes a config, loads it, rewrites the SAME path, invalidates,
// and reloads initially got the first version back from require()'s own
// cache despite the invalidation.
async function importConfigModule(root: string, path: string): Promise<KbachConfig | undefined> {
  configDependencies.set(pathKey(root), { root, files: new Set([pathKey(path)]) });
  // Node's ESM loader has no clearable cache the way CJS's `require.cache`
  // does — a unique query string makes each reload a distinct module
  // specifier, the standard workaround. (Each reload therefore leaves one
  // more module instance in memory for the session; engine.ts's in-flight
  // promise cache keeps that to one per actual config change.)
  const url = `${pathToFileURL(path).href}?t=${Date.now()}`;
  const mod = (await import(url)) as { default?: KbachConfig };
  return (mod.default ?? mod) as KbachConfig;
}

function requireConfigModule(root: string, path: string): KbachConfig | undefined {
  const req = createRequire(root);
  const resolved = req.resolve(path);
  // Evict ONLY what this root's config itself loaded last time (plus the
  // config file) — never every project-local cache entry, which in an
  // extension-development host could include this extension's own code.
  const previous = configDependencies.get(pathKey(root))?.files ?? new Set<string>();
  for (const cachedPath of Object.keys(req.cache)) {
    if (cachedPath === resolved || previous.has(pathKey(cachedPath))) delete req.cache[cachedPath];
  }
  const before = new Set(Object.keys(req.cache));
  try {
    const mod = req(path) as { default?: KbachConfig };
    return (mod.default ?? mod) as KbachConfig;
  } finally {
    // In `finally` so a config whose HELPER has the syntax error still
    // records that helper — saving the fix to it then re-triggers a load.
    const files = new Set([pathKey(resolved)]);
    for (const cachedPath of Object.keys(req.cache)) {
      if (!before.has(cachedPath) && isProjectLocalFile(root, cachedPath)) files.add(pathKey(cachedPath));
    }
    configDependencies.set(pathKey(root), { root, files });
  }
}

/**
 * Auto-discovers a `kbach.config.*` file at `root` (this extension's own
 * `findProjectRoot`'s result) — `undefined` if none exists, which is the
 * common, expected case for most projects. Checks `kbach.config.cjs` and
 * `.mjs` first (each loaded the one unambiguous way that's correct for
 * that extension), then the bare `kbach.config.js` via require() first,
 * falling back to a real `import()` only on a failure that specifically
 * indicates an ESM/CJS mismatch — see `isEsmRequireFailure`. A genuine
 * syntax error in an otherwise-correctly-formatted config file propagates
 * as a real, actionable error (surfaced to the user via a VS Code error
 * message by the caller), rather than being silently swallowed.
 */
export async function loadConfigFile(root: string): Promise<KbachConfig | undefined> {
  const cjsPath = join(root, 'kbach.config.cjs');
  if (existsSync(cjsPath)) return requireConfigModule(root, cjsPath);

  const mjsPath = join(root, 'kbach.config.mjs');
  if (existsSync(mjsPath)) return importConfigModule(root, mjsPath);

  const jsPath = join(root, 'kbach.config.js');
  if (!existsSync(jsPath)) {
    configDependencies.delete(pathKey(root));
    return undefined;
  }
  try {
    return requireConfigModule(root, jsPath);
  } catch (err) {
    if (!isEsmRequireFailure(err)) throw err;
    return importConfigModule(root, jsPath);
  }
}
