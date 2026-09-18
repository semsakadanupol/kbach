import * as p from '@clack/prompts';
import { detectCandidates, FRAMEWORK_LABEL, type Framework } from '../detect';
import { detectPackageManager, type PackageManager } from '../pm';
import { runViteInit } from './vite';
import { runExpoInit } from './expo';
import { runReactNativeCliInit } from './reactNativeCli';
import { runNextInit } from './next';
import { isInteractive } from '../isInteractive';
import { kbachTag } from '../style';

export interface InitCliFlags {
  dryRun: boolean;
  yes: boolean;
  pm: PackageManager | null;
  cwd: string;
}

async function pickFramework(root: string): Promise<Framework | null> {
  const candidates = detectCandidates(root);

  if (candidates.length === 1) {
    p.log.step(`${FRAMEWORK_LABEL[candidates[0]!.framework]} (${candidates[0]!.reason})`);
    return candidates[0]!.framework;
  }

  if (candidates.length > 1) {
    p.log.warn(`Multiple frameworks detected: ${candidates.map((c) => FRAMEWORK_LABEL[c.framework]).join(', ')}`);
  } else {
    p.log.warn('No supported framework auto-detected.');
  }

  if (!isInteractive()) {
    // Never silently guess when detection is ambiguous or empty (spec rule) —
    // and can't prompt here either (no real TTY), so this is a hard stop,
    // not a fallback to some default the way the dark-mode prompt has one.
    p.log.error(
      candidates.length > 1
        ? "Can't prompt for a choice in a non-interactive terminal. Re-run from a real terminal, or run this from a directory containing only one framework's package.json."
        : "No framework was detected and this isn't an interactive terminal to ask in.",
    );
    return null;
  }

  const picked = await p.select({
    message: 'Which framework is this?',
    options: (['expo', 'react-native-cli', 'vite', 'next'] as Framework[]).map((f) => ({
      value: f,
      label: FRAMEWORK_LABEL[f],
    })),
  });
  if (p.isCancel(picked)) {
    p.cancel('Cancelled.');
    return null;
  }
  return picked;
}

export async function runInit(flags: InitCliFlags): Promise<void> {
  p.intro(kbachTag() + ' init');

  const s = p.spinner();
  s.start('Detecting your project...');
  const framework = await pickFramework(flags.cwd);
  s.stop(framework ? `Framework: ${FRAMEWORK_LABEL[framework]}` : 'No framework selected');

  if (!framework) {
    process.exitCode = 1;
    return;
  }

  const pm = flags.pm ?? detectPackageManager(flags.cwd);
  const flowOpts = { root: flags.cwd, pm, dryRun: flags.dryRun, yes: flags.yes };

  if (framework === 'vite') {
    await runViteInit(flowOpts);
  } else if (framework === 'expo') {
    await runExpoInit(flowOpts);
  } else if (framework === 'react-native-cli') {
    await runReactNativeCliInit(flowOpts);
  } else {
    await runNextInit(flowOpts);
  }
}
