import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

const LOCKFILES: Record<PackageManager, string> = {
  pnpm: 'pnpm-lock.yaml',
  yarn: 'yarn.lock',
  bun: 'bun.lock',
  npm: 'package-lock.json',
};

/** Detects the package manager from whichever lockfile is present at `root`; defaults to npm. */
export function detectPackageManager(root: string): PackageManager {
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, LOCKFILES.bun))) return 'bun';
  if (existsSync(join(root, LOCKFILES.pnpm))) return 'pnpm';
  if (existsSync(join(root, LOCKFILES.yarn))) return 'yarn';
  return 'npm';
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
