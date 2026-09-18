import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { DoctorCheckResult } from '../types';

/**
 * Walks `root` and its ancestor directories looking for `node_modules/<pkg>/package.json`
 * — the same walk-up-to-filesystem-root algorithm Node's own resolver uses, since a
 * workspace/monorepo install (npm/pnpm/yarn workspaces) hoists a dependency to a parent
 * `node_modules` rather than the project's own. Checking only `<root>/node_modules`
 * would false-fail every hoisted install (confirmed live against this very repo's own
 * apps/web-sandbox, which resolves `@kbach/react` from the monorepo root two levels up).
 */
function findInstalledPackageJson(root: string, pkg: string): string | null {
  let dir = root;
  for (;;) {
    const candidate = join(dir, 'node_modules', ...pkg.split('/'), 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Reads the actually-installed version — not just whatever range `package.json` declares
 * (a stale `node_modules` after a `package.json` bump is exactly the "installed after your
 * last build" class of bug this command exists to catch). */
export function checkPackageInstalled(root: string, pkg: '@kbach/react' | '@kbach/react-native'): DoctorCheckResult {
  const pkgJsonPath = findInstalledPackageJson(root, pkg);
  if (!pkgJsonPath) {
    return {
      label: `${pkg} installed`,
      status: 'fail',
      fix: `npm install ${pkg}@beta`,
    };
  }
  try {
    const { version } = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    return { label: `${pkg} installed`, status: 'pass', detail: String(version) };
  } catch {
    return {
      label: `${pkg} installed`,
      status: 'fail',
      fix: `${pkgJsonPath} exists but isn't valid JSON — reinstall: npm install ${pkg}@beta`,
    };
  }
}
