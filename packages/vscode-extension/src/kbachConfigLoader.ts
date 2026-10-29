import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
  return (err as NodeJS.ErrnoException).code === 'ERR_REQUIRE_ESM' || /is not defined in ES module scope/.test(err.message);
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
async function importConfigModule(path: string): Promise<KbachConfig | undefined> {
  // Node's ESM loader has no clearable cache the way CJS's `require.cache`
  // does — a unique query string makes each reload a distinct module
  // specifier, the standard workaround.
  const url = `${pathToFileURL(path).href}?t=${Date.now()}`;
  const mod = (await import(url)) as { default?: KbachConfig };
  return (mod.default ?? mod) as KbachConfig;
}

function requireConfigModule(root: string, path: string): KbachConfig | undefined {
  const req = createRequire(root);
  const resolved = req.resolve(path);
  delete req.cache[resolved];
  const mod = req(path) as { default?: KbachConfig };
  return (mod.default ?? mod) as KbachConfig;
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
  if (existsSync(mjsPath)) return importConfigModule(mjsPath);

  const jsPath = join(root, 'kbach.config.js');
  if (!existsSync(jsPath)) return undefined;
  try {
    return requireConfigModule(root, jsPath);
  } catch (err) {
    if (!isEsmRequireFailure(err)) throw err;
    return importConfigModule(jsPath);
  }
}
