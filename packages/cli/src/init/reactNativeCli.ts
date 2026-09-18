import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { installPackage } from '../pm';
import { runCommand } from '../runCommand';
import { patchBabelConfigPlugin } from '../codemods/babelConfig';
import { writeFileAtomic } from '../fsAtomic';
import { resolveDarkModeStrategy, writeKbachConfigIfNeeded } from '../configFile';
import { findFirstExisting } from '../fsFind';
import { confirmOrDefault } from '../confirmPrompt';
import { red, gray } from '../style';
import type { InitFlowOptions } from './types';

const PLUGIN_ENTRY = '@kbach/react-native/babel-plugin';

const MANUAL_BABEL_SNIPPET = `module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['${PLUGIN_ENTRY}'],
};`;

const RN_CLI_BABEL_TEMPLATE = `${MANUAL_BABEL_SNIPPET}\n`;

export async function runReactNativeCliInit(opts: InitFlowOptions): Promise<void> {
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
    if (!opts.dryRun) writeFileAtomic(path, RN_CLI_BABEL_TEMPLATE);
    p.log.success(opts.dryRun ? `(dry run) would create ${path}` : `Created ${path}`);
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

  if (!opts.dryRun) {
    const shouldRebuild = await confirmOrDefault(
      'This app needs a native rebuild to link the module. Run npx react-native run-android now?',
      false,
      opts.yes,
    );
    if (shouldRebuild) {
      try {
        await runCommand('npx', ['react-native', 'run-android'], opts.root);
      } catch (err) {
        p.log.error((err as Error).message);
      }
    }
  }

  p.outro(
    'Done. Changed babel.config.js or kbach.config.js later? Restart with:\n\n  npx react-native start --reset-cache\n\nThen write your first class:\n\n  <View className="flex-1 items-center justify-center bg-white dark:bg-black">\n    <Text className="text-lg font-bold">Hello Kbach</Text>\n  </View>',
  );
}
