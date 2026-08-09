import prompts from 'prompts';
import type { Platform } from './detect';
import { TAG, dim, rule } from './theme';

export interface CliFlags {
  platform?: Platform;
  setup?: 'runtime' | 'static';
  yes: boolean;
  install: boolean;
  pm?: 'npm' | 'pnpm' | 'yarn' | 'bun';
}

export interface ResolvedAnswers {
  platform: Platform;
  /** null for native/next — there's only one setup path for those. */
  setup: 'runtime' | 'static' | null;
}

function exitOnCancel(): never {
  console.log('\nCancelled — nothing was changed.');
  process.exit(1);
}

/**
 * Prints the plan as context — never a confirmation gate itself. Actual
 * permission is per-action (see confirmAction below): declining one file
 * doesn't block the others, which a single blanket "Proceed?" over the
 * whole batch couldn't do. Skipped entirely under --yes.
 */
export function printPlan(summaryLines: string[]): void {
  rule();
  console.log(`${TAG()} Here's what create-kbach found, and what it may do:`);
  console.log();
  for (const line of summaryLines) console.log(`  ${dim('›')} ${line}`);
  console.log();
  rule();
}

/**
 * Per-action y/n confirmation — asked individually right before each file
 * create/change (kbach.config.js, babel.config.js, kbach.css,
 * tsconfig.json), so declining one doesn't block the others. Always true
 * under --yes (nothing to confirm unattended). Ctrl+C during a prompt still
 * exits cleanly via exitOnCancel, matching every other prompts() call here.
 */
export async function confirmAction(message: string, flags: CliFlags): Promise<boolean> {
  if (flags.yes) return true;
  const res = await prompts(
    { type: 'confirm', name: 'confirmed', message, initial: true },
    { onCancel: exitOnCancel },
  );
  return !!res.confirmed;
}

/**
 * Only prompts for what flags/auto-detection didn't already resolve. Every
 * prompts() call passes onCancel so Ctrl+C exits cleanly instead of
 * continuing with an undefined answer.
 */
export async function resolveAnswers(
  detectedPlatform: Platform | null,
  flags: CliFlags,
): Promise<ResolvedAnswers> {
  let platform = flags.platform ?? detectedPlatform ?? undefined;

  if (!platform) {
    const res = await prompts(
      {
        type: 'select',
        name: 'platform',
        message: 'Which platform are you setting up Kbach for?',
        choices: [
          { title: 'Web (Vite)', value: 'web' },
          { title: 'Next.js', value: 'next' },
          { title: 'React Native / Expo', value: 'native' },
        ],
      },
      { onCancel: exitOnCancel },
    );
    platform = res.platform as Platform;
  }

  let setup: 'runtime' | 'static' | null = null;
  if (platform === 'web') {
    setup = flags.setup ?? null;
    if (!setup) {
      if (flags.yes) {
        // NOT the same choice as the interactive prompt's recommendation
        // below, deliberately: Static CSS needs two manual Tier 2 follow-ups
        // (wire vite.config.ts, import kbach.css) before it does anything, so
        // defaulting to it unattended would leave the app looking broken
        // (no styles at all) until those are done by hand. Runtime only
        // needs the ThemeProvider wrap and works immediately, so it's the
        // safer thing to land on with nobody there to finish the setup.
        setup = 'runtime';
      } else {
        const res = await prompts(
          {
            type: 'select',
            name: 'setup',
            message: 'Runtime setup (client-side CSS injection) or Static CSS setup (Vite plugin, zero runtime cost)?',
            choices: [
              { title: 'Static CSS (recommended) — Vite only, zero runtime cost', value: 'static' },
              { title: 'Runtime — simplest to try, works with any bundler', value: 'runtime' },
            ],
          },
          { onCancel: exitOnCancel },
        );
        setup = res.setup as 'runtime' | 'static';
      }
    }
  }

  return { platform, setup };
}
