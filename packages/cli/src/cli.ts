import { resolve } from 'node:path';
import { runInit } from './init';
import { runDoctor } from './doctor';
import type { PackageManager } from './pm';
import { kbachTag, red } from './style';

const VALID_PMS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

function parsePmFlag(args: string[]): PackageManager | null {
  const idx = args.indexOf('--pm');
  if (idx === -1) return null;
  const value = args[idx + 1];
  if (!value || !VALID_PMS.includes(value as PackageManager)) {
    console.error(`${kbachTag()} ${red(`--pm expects one of: ${VALID_PMS.join(', ')}`)}`);
    process.exit(1);
  }
  return value as PackageManager;
}

/**
 * Lets `init`/`doctor` target a directory other than wherever the command
 * happened to be run from — a monorepo where you want to run this once
 * against `apps/mobile` from the workspace root, or a script/CI step
 * that already knows the target path and shouldn't need an extra `cd`.
 * Relative paths resolve against the REAL `process.cwd()`, not the
 * eventual `cwd` this returns.
 */
function parseCwdFlag(args: string[]): string {
  const idx = args.indexOf('--cwd');
  if (idx === -1) return process.cwd();
  const value = args[idx + 1];
  if (!value) {
    console.error(`${kbachTag()} ${red('--cwd expects a path')}`);
    process.exit(1);
  }
  return resolve(process.cwd(), value);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  const cwd = parseCwdFlag(rest);

  if (command === 'init') {
    await runInit({
      dryRun: rest.includes('--dry-run'),
      yes: rest.includes('-y') || rest.includes('--yes'),
      pm: parsePmFlag(rest),
      cwd,
    });
    return;
  }

  if (command === 'doctor') {
    const code = await runDoctor({ cwd });
    process.exitCode = code;
    return;
  }

  console.log(`${kbachTag()} usage: kbach <init|doctor> [--dry-run] [-y|--yes] [--pm <npm|pnpm|yarn|bun>] [--cwd <path>]`);
  process.exitCode = command ? 1 : 0;
}

main().catch((err) => {
  console.error(`${kbachTag()} ${red('Unexpected error:')}`, err);
  process.exitCode = 1;
});
