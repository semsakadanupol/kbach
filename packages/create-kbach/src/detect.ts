import * as fs from 'fs';
import * as path from 'path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type Platform = 'web' | 'next' | 'native';

export interface ProjectInfo {
  root: string;
  pkg: Record<string, unknown>;
  packageManager: PackageManager;
  /** Auto-detected platform, or null when ambiguous/unknown — caller must prompt. */
  platform: Platform | null;
}

function readPackageJson(root: string): Record<string, unknown> | null {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}

function fileExists(root: string, ...names: string[]): boolean {
  return names.some((name) => fs.existsSync(path.join(root, name)));
}

export function detectPackageManager(root: string): PackageManager {
  if (fileExists(root, 'bun.lockb', 'bun.lock')) return 'bun';
  if (fileExists(root, 'pnpm-lock.yaml')) return 'pnpm';
  if (fileExists(root, 'yarn.lock')) return 'yarn';
  return 'npm';
}

/**
 * Auto-detects the target platform from package.json deps and known config
 * files. Returns null (ambiguous/unknown) rather than guessing wrong — the
 * caller prompts the user in that case. Checked in order of how unambiguous
 * the signal is: Next.js's own config file/dependency is never present
 * alongside a React Native project, so it's checked first and short-circuits;
 * native and web are checked after and only one should ever match in a
 * normal (non-monorepo-root) project directory.
 */
export function detectPlatform(root: string, pkg: Record<string, unknown>): Platform | null {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };

  const hasNext = 'next' in deps || fileExists(root, 'next.config.js', 'next.config.mjs', 'next.config.ts');
  if (hasNext) return 'next';

  const hasNative =
    'expo' in deps ||
    'react-native' in deps ||
    fileExists(root, 'app.json', 'app.config.js', 'app.config.ts', 'metro.config.js');
  const hasWeb = 'vite' in deps || fileExists(root, 'vite.config.js', 'vite.config.ts', 'vite.config.mjs');

  if (hasNative && hasWeb) return null; // ambiguous — let the user pick
  if (hasNative) return 'native';
  if (hasWeb) return 'web';
  return null;
}

/**
 * Reads package.json from `cwd` and detects package manager + platform.
 * Returns null (not throws) when no package.json is found — the CLI treats
 * that as "not an existing project" and prints guidance instead of erroring.
 */
export function readProjectInfo(cwd: string): ProjectInfo | null {
  const pkg = readPackageJson(cwd);
  if (!pkg) return null;
  return {
    root: cwd,
    pkg,
    packageManager: detectPackageManager(cwd),
    platform: detectPlatform(cwd, pkg),
  };
}
