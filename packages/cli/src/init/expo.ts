import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { installPackage, installDevPackage } from '../pm';
import { patchBabelConfigPlugin } from '../codemods/babelConfig';
import { writeFileAtomic } from '../fsAtomic';
import { resolveDarkModeStrategy, writeKbachConfigIfNeeded } from '../configFile';
import { findFirstExisting } from '../fsFind';
import { red, gray } from '../style';
import type { InitFlowOptions } from './types';

const PLUGIN_ENTRY = '@kbach/react-native/babel-plugin';

const MANUAL_BABEL_SNIPPET = `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['${PLUGIN_ENTRY}'],
  };
};`;

const EXPO_BABEL_TEMPLATE = `${MANUAL_BABEL_SNIPPET}\n`;

/**
 * Confirmed live against a real, fresh `create-expo-app` (SDK 57) install:
 * `babel-preset-expo` resolved fine from inside `@expo/metro-config`'s own
 * node_modules (which is why the project needs no babel.config.js at all
 * by default), but once a project-root babel.config.js exists — which
 * kbach's plugin genuinely requires, per react-native/AGENTS.md §1 — Babel
 * resolves `presets: ['babel-preset-expo']` from the CONFIG FILE's own
 * directory instead, and npm had left `babel-preset-expo` nested under
 * `node_modules/expo/node_modules/` rather than hoisted to the top level
 * (not a version conflict — confirmed only one version anywhere in the
 * tree — just how that particular install happened to shake out). The
 * exact documented babel.config.js snippet (AGENTS.md, this template)
 * fails identically for anyone hitting this, independent of the CLI; a
 * plain `npx expo export` reproduces it. Only relevant when this flow is
 * the one CREATING a new babel.config.js — an existing one that already
 * references the preset must already be resolving, or the project
 * wouldn't have been building before.
 */
function babelPresetExpoResolves(root: string): boolean {
  try {
    createRequire(join(root, 'package.json')).resolve('babel-preset-expo');
    return true;
  } catch {
    return false;
  }
}

export async function runExpoInit(opts: InitFlowOptions): Promise<void> {
  const s = p.spinner();
  s.start('Installing @kbach/react-native...');
  if (!opts.dryRun) {
    try {
      await installPackage(opts.pm, '@kbach/react-native@beta', opts.root);
    } catch (err) {
      s.stop(red('Install failed'));
      p.log.error((err as Error).message);
      process.exitCode = 1;
      return;
    }
  }
  s.stop(opts.dryRun ? gray(`(dry run) would install @kbach/react-native via ${opts.pm}`) : '@kbach/react-native installed');

  const babelConfigPath = findFirstExisting(opts.root, ['babel.config.js']);
  if (!babelConfigPath) {
    const path = join(opts.root, 'babel.config.js');
    if (!opts.dryRun) writeFileAtomic(path, EXPO_BABEL_TEMPLATE);
    p.log.success(opts.dryRun ? `(dry run) would create ${path}` : `Created ${path}`);

    if (!opts.dryRun && !babelPresetExpoResolves(opts.root)) {
      p.log.warn("babel-preset-expo isn't resolvable from your project root (an npm hoisting quirk, not a version conflict) — installing it directly so the new babel.config.js actually works.");
      try {
        await installDevPackage(opts.pm, 'babel-preset-expo', opts.root);
        p.log.success('babel-preset-expo installed');
      } catch (err) {
        p.log.error((err as Error).message);
      }
    }
  } else {
    const original = readFileSync(babelConfigPath, 'utf-8');
    const result = patchBabelConfigPlugin(original, PLUGIN_ENTRY);
    if (!result.ok) {
      p.log.warn(`Couldn't safely patch ${babelConfigPath} (${result.reason}) — add this yourself:`);
      p.log.message(MANUAL_BABEL_SNIPPET);
    } else if (!result.changed) {
      p.log.step(`${babelConfigPath} already has the kbach babel plugin`);
    } else {
      if (!opts.dryRun) writeFileAtomic(babelConfigPath, result.code);
      p.log.success(opts.dryRun ? `(dry run) would update ${babelConfigPath}` : `Updated ${babelConfigPath}`);
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
    'Done. Restart with a cleared cache so Metro picks up the babel change:\n\n  npx expo start --clear\n\nThen write your first class:\n\n  <View className="flex-1 items-center justify-center bg-white dark:bg-black">\n    <Text className="text-lg font-bold">Hello Kbach</Text>\n  </View>',
  );
}
