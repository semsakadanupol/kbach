import { readFileSync } from 'node:fs';
import * as p from '@clack/prompts';
import { installPackage } from '../pm';
import { patchViteConfig } from '../codemods/viteConfig';
import { findEntryFile, patchEntryFileImport } from '../codemods/entryImport';
import { writeFileAtomic } from '../fsAtomic';
import { resolveDarkModeStrategy, writeKbachConfigIfNeeded } from '../configFile';
import { findFirstExisting } from '../fsFind';
import { red, gray } from '../style';
import type { InitFlowOptions } from './types';

const VITE_CONFIG_NAMES = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];

const MANUAL_VITE_SNIPPET = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/react/vite';

export default defineConfig({ plugins: [kbach(), react()] });`;

export async function runViteInit(opts: InitFlowOptions): Promise<void> {
  const s = p.spinner();
  s.start('Installing @kbach/react...');
  if (!opts.dryRun) {
    try {
      await installPackage(opts.pm, '@kbach/react@beta', opts.root);
    } catch (err) {
      s.stop(red('Install failed'));
      p.log.error((err as Error).message);
      process.exitCode = 1;
      return;
    }
  }
  s.stop(opts.dryRun ? gray(`(dry run) would install @kbach/react via ${opts.pm}`) : '@kbach/react installed');

  const viteConfigPath = findFirstExisting(opts.root, VITE_CONFIG_NAMES);
  if (!viteConfigPath) {
    p.log.error("No vite.config.{ts,js,mts,mjs} found — add this yourself:");
    p.log.message(MANUAL_VITE_SNIPPET);
  } else {
    const original = readFileSync(viteConfigPath, 'utf-8');
    const result = patchViteConfig(original);
    if (!result.ok) {
      p.log.warn(`Couldn't safely patch ${viteConfigPath} (${result.reason}) — add this yourself:`);
      p.log.message(MANUAL_VITE_SNIPPET);
    } else if (!result.changed) {
      p.log.step(`${viteConfigPath} already wired up`);
    } else {
      if (!opts.dryRun) writeFileAtomic(viteConfigPath, result.code);
      p.log.success(
        opts.dryRun ? `(dry run) would update ${viteConfigPath}` : `Updated ${viteConfigPath}`,
      );
    }
  }

  const entryPath = findEntryFile(opts.root);
  if (!entryPath) {
    p.log.warn("No src/main.{tsx,ts,jsx,js} or app/root.{tsx,ts} found — add `import './kbach.css';` to your entry file yourself.");
  } else {
    const original = readFileSync(entryPath, 'utf-8');
    const result = patchEntryFileImport(original);
    if (!result.changed) {
      p.log.step(`${entryPath} already imports kbach.css`);
    } else {
      if (!opts.dryRun) writeFileAtomic(entryPath, result.code);
      p.log.success(opts.dryRun ? `(dry run) would update ${entryPath}` : `Updated ${entryPath}`);
    }
  }

  const strategy = await resolveDarkModeStrategy(opts.yes);
  const configResult = writeKbachConfigIfNeeded(opts.root, strategy, opts.dryRun);
  if (configResult === 'created') {
    p.log.success(opts.dryRun ? '(dry run) would create kbach.config.js' : 'Created kbach.config.js');
  } else if (configResult === 'skipped-exists') {
    p.log.step('kbach.config.js already exists — left untouched');
  }

  p.outro('Done. Write your first class:\n\n  <div className="flex items-center justify-center bg-white dark:bg-black">\n    <p className="text-lg font-bold">Hello Kbach</p>\n  </div>');
}
