import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

const LOCKFILES: Record<PackageManager, string> = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  bun: 'bun.lock',
  npm: 'package-lock.json',
};

function lockfileAt(dir: string): PackageManager | null {
  if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, LOCKFILES.bun))) return 'bun';
  if (existsSync(join(dir, LOCKFILES.pnpm))) return 'pnpm';
  if (existsSync(join(dir, LOCKFILES.yarn))) return 'yarn';
  if (existsSync(join(dir, LOCKFILES.npm))) return 'npm';
  return null;
}

/**
 * Walks `root` and its ancestor directories looking for a lockfile — the
 * same walk-up-to-filesystem-root algorithm `doctor/checks/packageInstalled.ts`'s
 * `findInstalledPackageJson` already uses for `node_modules`, for the
 * identical reason: in a monorepo, the lockfile conventionally lives at
 * the WORKSPACE root, not inside the individual app/package directory a
 * user actually runs `kbach init`/`doctor` from. Checking only `root`
 * itself silently defaulted to npm for any monorepo on pnpm/yarn/bun —
 * confirmed as a real gap, not hypothetical, the same class of bug
 * `findInstalledPackageJson`'s own doc comment already describes.
 * Defaults to npm only once the walk reaches the filesystem root with no
 * lockfile found anywhere.
 */
export function detectPackageManager(root: string): PackageManager {
  let dir = root;
  for (;;) {
    const found = lockfileAt(dir);
    if (found) return found;
    const parent = dirname(dir);
    if (parent === dir) return 'npm';
    dir = parent;
  }
}

const INSTALL_ARGS: Record<PackageManager, string[]> = {
  npm: ['install'],
  pnpm: ['add'],
  yarn: ['add'],
  bun: ['add'],
};

const DEV_FLAG: Record<PackageManager, string> = {
  npm: '--save-dev',
  pnpm: '-D',
  yarn: '-D',
  bun: '-d',
};

function runInstall(pm: PackageManager, args: string[], root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // On Windows, npm/pnpm/yarn/bun are .cmd shims — Node's spawn() can't
    // exec those directly (EINVAL) without shell:true, unlike a real .exe.
    const child = spawn(pm, args, {
      cwd: root,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${pm} ${args.join(' ')} exited with code ${code}${stderr ? `\n${stderr}` : ''}`));
    });
  });
}

/** Shells out to `<pm> install <pkg>`, streaming output. Rejects on a non-zero exit code. */
export function installPackage(pm: PackageManager, pkg: string, root: string): Promise<void> {
  return runInstall(pm, [...INSTALL_ARGS[pm], pkg], root);
}

/** Same as `installPackage`, but as a devDependency — see each PM's own dev flag in `DEV_FLAG`. */
export function installDevPackage(pm: PackageManager, pkg: string, root: string): Promise<void> {
  return runInstall(pm, [...INSTALL_ARGS[pm], pkg, DEV_FLAG[pm]], root);
}
