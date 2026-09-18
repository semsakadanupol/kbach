import * as p from '@clack/prompts';
import { isInteractive } from './isInteractive';

/**
 * Same non-TTY-safety contract as configFile.ts's `resolveDarkModeStrategy`
 * — `-y` and "no real TTY to prompt on" both take `defaultValue` without
 * ever calling `p.confirm()` (which has the identical `ERR_TTY_INIT_FAILED`
 * crash risk `select()` does — see isInteractive.ts). Used by the React
 * Native CLI flow's "run the native rebuild now?" question, whose
 * documented default is decline (print the command instead of running it).
 */
export async function confirmOrDefault(message: string, defaultValue: boolean, yes: boolean): Promise<boolean> {
  if (yes) return defaultValue;
  if (!isInteractive()) {
    p.log.warn(`Non-interactive terminal — skipping this prompt (pass -y to silence this): ${message}`);
    return defaultValue;
  }
  const result = await p.confirm({ message, initialValue: defaultValue });
  if (p.isCancel(result)) {
    p.cancel('Cancelled.');
    process.exit(1);
  }
  return result;
}
