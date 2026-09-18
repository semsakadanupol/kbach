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

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === 'init') {
    await runInit({
      dryRun: rest.includes('--dry-run'),
      yes: rest.includes('-y') || rest.includes('--yes'),
      pm: parsePmFlag(rest),
      cwd: process.cwd(),
    });
    return;
  }

  if (command === 'doctor') {
    const code = await runDoctor({ cwd: process.cwd() });
    process.exitCode = code;
    return;
  }

  console.log(`${kbachTag()} usage: kbach <init|doctor> [--dry-run] [-y|--yes] [--pm <npm|pnpm|yarn|bun>]`);
  process.exitCode = command ? 1 : 0;
}

main().catch((err) => {
  console.error(`${kbachTag()} ${red('Unexpected error:')}`, err);
  process.exitCode = 1;
});
