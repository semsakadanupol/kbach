import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Walks `startDir` and its ancestors looking for the NEAREST directory
 * containing a `package.json` — this extension's working notion of
 * "project root" wherever one is needed from an open file's own location
 * (native-support detection, `kbach.config.js` discovery), mirroring
 * `@kbach/cli`'s own `detectPackageManager` walk-up (`packages/cli/src/
 * pm.ts`) for the identical reason: in a monorepo, the VS Code WORKSPACE
 * FOLDER is usually the repo root, not the individual app/package a given
 * file lives in. `null` if no ancestor has one (reached the filesystem
 * root first).
 */
export function findProjectRoot(startDir: string): string | null {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
