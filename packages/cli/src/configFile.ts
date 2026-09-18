import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { writeFileAtomic } from './fsAtomic';
import { isInteractive } from './isInteractive';

export type DarkModeChoice = 'media' | 'attribute' | 'class';

/**
 * `null` means "system default" — `darkMode: 'media'` is already the
 * engine's own default (root AGENTS.md §4), so choosing it means no
 * config file is written at all rather than one that just restates the
 * default.
 */
async function promptDarkModeStrategy(): Promise<DarkModeChoice | null> {
  const choice = await p.select({
    message: 'Dark mode strategy?',
    options: [
      { value: null, label: 'System default (no config file needed)' },
      { value: 'attribute', label: "Manual toggle ('attribute')" },
      { value: 'class', label: "Manual toggle ('class')" },
    ],
    initialValue: null,
  });
  if (p.isCancel(choice)) {
    p.cancel('Cancelled.');
    process.exit(1);
  }
  return choice;
}

/**
 * The single call site every init flow (vite/expo/react-native-cli/next)
 * goes through for the dark-mode question — centralized specifically so
 * the non-TTY fallback (see isInteractive.ts's own doc comment for the
 * `ERR_TTY_INIT_FAILED` crash this avoids) only has to be gotten right
 * once. `-y` and "no real TTY to prompt on" both take the same system-
 * default fallback; only the log message differs, since one was asked for
 * and the other wasn't.
 */
export async function resolveDarkModeStrategy(yes: boolean): Promise<DarkModeChoice | null> {
  if (yes) return null;
  if (!isInteractive()) {
    p.log.warn('Non-interactive terminal — using system default dark mode (pass -y to silence this).');
    return null;
  }
  return promptDarkModeStrategy();
}

/**
 * Creates `kbach.config.js` at `root` only if it doesn't already exist —
 * re-running `init` must be a no-op, never overwrite a config the user
 * has since customized. CommonJS (`module.exports`), not ESM: the
 * react-native babel plugin loads it via a raw Node `require()` (see
 * packages/react-native/AGENTS.md §2), so ESM would break that target;
 * both Vite's and PostCSS's loaders accept CJS too, so one shape works
 * for every framework this command targets.
 *
 * Returns what happened, for the caller's own step-output line.
 */
export function writeKbachConfigIfNeeded(
  root: string,
  strategy: DarkModeChoice | null,
  dryRun: boolean,
): 'created' | 'skipped-exists' | 'skipped-default' {
  if (strategy === null) return 'skipped-default';
  const path = join(root, 'kbach.config.js');
  if (existsSync(path)) return 'skipped-exists';
  const content = `module.exports = {\n  darkMode: '${strategy}',\n};\n`;
  if (!dryRun) writeFileAtomic(path, content);
  return 'created';
}
