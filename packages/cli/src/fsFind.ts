import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Returns the absolute path of the first `names` entry that exists under `root`, else null. */
export function findFirstExisting(root: string, names: string[]): string | null {
  for (const name of names) {
    const p = join(root, name);
    if (existsSync(p)) return p;
  }
  return null;
}
