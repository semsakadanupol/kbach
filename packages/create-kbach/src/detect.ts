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

type PackageJsonResult =
  | { status: 'found'; pkg: Record<string, unknown> }
  | { status: 'missing' }
  | { status: 'malformed' };

function readPackageJson(root: string): PackageJsonResult {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return { status: 'missing' };
  try {
    return { status: 'found', pkg: JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) };
  } catch {
    return { status: 'malformed' };
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
 * Expo and bare React Native projects need different babel presets
 * ('babel-preset-expo' vs '@react-native/babel-preset') — detectPlatform()
 * above treats both as the same 'native' platform, so the babel.config.js
 * template needs this separate, narrower check to pick the right one.
 * metro.config.js is deliberately excluded here (unlike detectPlatform's
 * native check) — both project types have one, so it isn't an Expo signal.
 */
export function isExpoProject(root: string, pkg: Record<string, unknown>): boolean {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  return 'expo' in deps || fileExists(root, 'app.json', 'app.config.js', 'app.config.ts');
}

export type ReadProjectInfoResult =
  | { status: 'ok'; info: ProjectInfo }
  | { status: 'missing' }
  | { status: 'malformed' };

/**
 * Reads package.json from `cwd` and detects package manager + platform.
 * Distinguishes "no package.json" (not an existing project — the CLI prints
 * guidance to scaffold one first) from "package.json exists but doesn't
 * parse" (a real problem in the user's project the CLI can't safely act
 * around) — the two used to collapse into the same `null`, which meant a
 * broken package.json got the misleading "no package.json found" message.
 */
export function readProjectInfo(cwd: string): ReadProjectInfoResult {
  const result = readPackageJson(cwd);
  if (result.status !== 'found') return { status: result.status };
  return {
    status: 'ok',
    info: {
      root: cwd,
      pkg: result.pkg,
      packageManager: detectPackageManager(cwd),
      platform: detectPlatform(cwd, result.pkg),
    },
  };
}
