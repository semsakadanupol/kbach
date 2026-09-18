import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { installPackage } from '../pm';
import { patchPostcssConfig } from '../codemods/postcssConfig';
import { ensureKbachCssMarkers } from '../codemods/globalsCssMarkers';
import { writeFileAtomic } from '../fsAtomic';
import { resolveDarkModeStrategy, writeKbachConfigIfNeeded } from '../configFile';
import { findFirstExisting } from '../fsFind';
import { red, gray } from '../style';
import type { InitFlowOptions } from './types';

const POSTCSS_CONFIG_NAMES = ['postcss.config.js', 'postcss.config.mjs', 'postcss.config.cjs'];
const GLOBALS_CSS_CANDIDATES = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css'];

const MANUAL_POSTCSS_SNIPPET = `module.exports = { plugins: { '@kbach/react/postcss': {} } };`;

const MANUAL_MARKERS_SNIPPET = `/* kbach:start */\n/* kbach:end */`;

export async function runNextInit(opts: InitFlowOptions): Promise<void> {
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

  const postcssConfigPath = findFirstExisting(opts.root, POSTCSS_CONFIG_NAMES);
  if (!postcssConfigPath) {
    const path = join(opts.root, 'postcss.config.js');
    if (!opts.dryRun) writeFileAtomic(path, `${MANUAL_POSTCSS_SNIPPET}\n`);
    p.log.success(opts.dryRun ? `(dry run) would create ${path}` : `Created ${path}`);
  } else {
    const original = readFileSync(postcssConfigPath, 'utf-8');
    const result = patchPostcssConfig(original);
    if (!result.ok) {
      p.log.warn(`Couldn't safely patch ${postcssConfigPath} (${result.reason}) — add this yourself:`);
      p.log.message(MANUAL_POSTCSS_SNIPPET);
    } else if (!result.changed) {
      p.log.step(`${postcssConfigPath} already has the kbach plugin`);
    } else {
      if (!opts.dryRun) writeFileAtomic(postcssConfigPath, result.code);
      p.log.success(opts.dryRun ? `(dry run) would update ${postcssConfigPath}` : `Updated ${postcssConfigPath}`);
    }
  }

  const globalsCssPath = findFirstExisting(opts.root, GLOBALS_CSS_CANDIDATES);
  if (!globalsCssPath) {
    p.log.warn(
      `No app/globals.css, src/app/globals.css, or styles/globals.css found — add these markers to your global stylesheet yourself, then import it once from your entry point:`,
    );
    p.log.message(MANUAL_MARKERS_SNIPPET);
  } else {
    const original = readFileSync(globalsCssPath, 'utf-8');
    const result = ensureKbachCssMarkers(original);
    if (!result.changed) {
      p.log.step(`${globalsCssPath} already has the kbach marker pair`);
    } else {
      if (!opts.dryRun) writeFileAtomic(globalsCssPath, result.code);
      p.log.success(opts.dryRun ? `(dry run) would update ${globalsCssPath}` : `Updated ${globalsCssPath}`);
    }
  }

  const strategy = await resolveDarkModeStrategy(opts.yes);
  const configResult = writeKbachConfigIfNeeded(opts.root, strategy, opts.dryRun);
  if (configResult === 'created') {
    p.log.success(opts.dryRun ? '(dry run) would create kbach.config.js' : 'Created kbach.config.js');
  } else if (configResult === 'skipped-exists') {
    p.log.step('kbach.config.js already exists — left untouched');
  }

  p.outro(
    'Done. Write your first class:\n\n  <div className="flex items-center justify-center bg-white dark:bg-black">\n    <p className="text-lg font-bold">Hello Kbach</p>\n  </div>',
  );
}
