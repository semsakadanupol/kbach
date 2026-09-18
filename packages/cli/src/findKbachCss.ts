import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.turbo', 'coverage']);
const MAX_DEPTH = 6;

/** Depth-limited search for a file literally named `kbach.css` anywhere under `root`. */
export function findKbachCssFile(root: string, dir = root, depth = 0): string | null {
  if (depth > MAX_DEPTH) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isFile() && entry === 'kbach.css') return full;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const found = findKbachCssFile(root, full, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
