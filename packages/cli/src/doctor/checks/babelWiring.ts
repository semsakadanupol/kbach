import { readFileSync } from 'node:fs';
import { isBabelPluginWired } from '../../codemods/babelConfig';
import { findFirstExisting } from '../../fsFind';
import type { DoctorCheckResult } from '../types';

const PLUGIN_ENTRY = '@kbach/react-native/babel-plugin';

/** RN/Expo counterpart to viteWiring.ts's check — see its own doc comment for the shared pattern. */
export function checkBabelPluginWiring(root: string): DoctorCheckResult {
  const path = findFirstExisting(root, ['babel.config.js']);
  if (!path) {
    return {
      label: 'babel.config.js has the kbach plugin',
      status: 'fail',
      fix: 'No babel.config.js found at the project root.',
    };
  }
  const result = isBabelPluginWired(readFileSync(path, 'utf-8'), PLUGIN_ENTRY);
  if (!result.ok) {
    return {
      label: 'babel.config.js has the kbach plugin',
      status: 'fail',
      fix: `Couldn't verify automatically (${result.reason}) — confirm '${PLUGIN_ENTRY}' appears in the plugins array in ${path}.`,
    };
  }
  return result.wired
    ? { label: 'babel.config.js has the kbach plugin', status: 'pass' }
    : {
        label: 'babel.config.js has the kbach plugin',
        status: 'fail',
        fix: `Run \`npx @kbach/cli init\` or add '${PLUGIN_ENTRY}' to the plugins array in ${path}.`,
      };
}
