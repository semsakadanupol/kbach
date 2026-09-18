import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DoctorCheckResult } from '../types';

const SKIP_DIRS = new Set(['.bin', '.git']);
const MAX_DEPTH = 4;

function readVersion(pkgDir: string): string | null {
  try {
    return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8')).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Walks `<root>/node_modules` looking for a SECOND, differently-located
 * copy of `packageName` nested inside some other package's own
 * node_modules — the exact shape react-native/AGENTS.md §11 describes
 * ("Metro can end up with two physical copies... different files resolve
 * to different module instances"). A plain non-monorepo `npm install`
 * never nests a package's own direct dependency this way (that doc's own
 * claim) — this only fires for a real hoisting conflict, so it's a
 * meaningful signal, not noise, when it does. Depth-bounded since
 * node_modules trees can be very deep; a duplicate worth flagging is
 * always near the top (nested inside a directly-installed package, not
 * ten levels of transitive deps down).
 */
function findNestedCopies(nodeModulesDir: string, packageName: string, depth = 0): string[] {
  if (depth > MAX_DEPTH) return [];
  let entries: string[];
  try {
    entries = readdirSync(nodeModulesDir);
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.') && !entry.startsWith('@')) continue;
    if (SKIP_DIRS.has(entry)) continue;
    const entryPath = join(nodeModulesDir, entry);
    let st;
    try {
      st = statSync(entryPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    if (entry.startsWith('@')) {
      // Scoped dir — descend one level into it for its own packages, not itself.
      found.push(...findNestedCopies(entryPath, packageName, depth));
      continue;
    }

    const ownNodeModules = join(entryPath, 'node_modules');
    const nestedPkg = join(ownNodeModules, ...packageName.split('/'));
    if (existsSync(nestedPkg)) found.push(nestedPkg);
    found.push(...findNestedCopies(ownNodeModules, packageName, depth + 1));
  }
  return found;
}

function checkOne(root: string, packageName: string): DoctorCheckResult {
  const label = `no duplicate ${packageName} instances`;
  const topLevel = join(root, 'node_modules', ...packageName.split('/'));
  if (!existsSync(topLevel)) {
    return { label, status: 'pass' }; // Nothing to compare against — not this check's concern.
  }
  const topVersion = readVersion(topLevel);

  const nested = findNestedCopies(join(root, 'node_modules'), packageName).filter((p) => p !== topLevel);
  if (nested.length === 0) return { label, status: 'pass' };

  const distinctVersions = new Set([topVersion, ...nested.map(readVersion)]);
  const versionNote = distinctVersions.size > 1 ? ` (different versions: ${[...distinctVersions].join(', ')})` : '';

  return {
    label,
    status: 'fail',
    fix: `Found ${nested.length} extra ${packageName} instance(s) nested under another package${versionNote} — add a metro.config.js resolver.resolveRequest override pointing '${packageName}' at ${topLevel} (react-native/AGENTS.md §11).`,
  };
}

export function checkDuplicateInstances(root: string): DoctorCheckResult[] {
  return [checkOne(root, 'react-native'), checkOne(root, 'react')];
}
