import prompts from 'prompts';
import type { Platform } from './detect';

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
        // Safer default under --yes: works with any bundler config, no extra
        // plugin wiring needed on top of what Tier 1 already automates.
        setup = 'runtime';
      } else {
        const res = await prompts(
          {
            type: 'select',
            name: 'setup',
            message: 'Runtime setup (client-side CSS injection) or Static CSS setup (Vite plugin, zero runtime cost)?',
            choices: [
              { title: 'Runtime — simplest, works everywhere', value: 'runtime' },
              { title: 'Static CSS — Vite only, zero runtime cost', value: 'static' },
            ],
          },
          { onCancel: exitOnCancel },
        );
        setup = res.setup as 'runtime' | 'static';
      }
    }
  }

  if (!flags.yes) {
    const res = await prompts(
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Proceed?',
        initial: true,
      },
      { onCancel: exitOnCancel },
    );
    if (!res.confirmed) exitOnCancel();
  }

  return { platform, setup };
}
