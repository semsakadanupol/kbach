import { spawn } from 'node:child_process';

/**
 * Shells out to `cmd args...`, streaming its own stdio straight through
 * (unlike pm.ts's `installPackage`, which captures output for a spinner —
 * this is for commands like `npx react-native run-android` whose own
 * Gradle/Metro progress output the user genuinely wants to watch live).
 * Rejects on a non-zero exit code. Same Windows `.cmd`-shim caveat as
 * `installPackage` — see that function's own comment.
 */
export function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}
