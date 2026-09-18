import { readFileSync } from 'node:fs';
import { isPostcssConfigWired } from '../../codemods/postcssConfig';
import { findFirstExisting } from '../../fsFind';
import type { DoctorCheckResult } from '../types';

const POSTCSS_CONFIG_NAMES = ['postcss.config.js', 'postcss.config.mjs', 'postcss.config.cjs'];
const GLOBALS_CSS_CANDIDATES = ['app/globals.css', 'src/app/globals.css', 'styles/globals.css'];

/** Next.js counterpart to viteWiring.ts's check. */
export function checkPostcssConfigWiring(root: string): DoctorCheckResult {
  const path = findFirstExisting(root, POSTCSS_CONFIG_NAMES);
  if (!path) {
    return {
      label: 'postcss config has the kbach plugin',
      status: 'fail',
      fix: 'No postcss.config.{js,mjs,cjs} found at the project root.',
    };
  }
  const result = isPostcssConfigWired(readFileSync(path, 'utf-8'));
  if (!result.ok) {
    return {
      label: 'postcss config has the kbach plugin',
      status: 'fail',
      fix: `Couldn't verify automatically (${result.reason}) — confirm '@kbach/react/postcss' appears in ${path}.`,
    };
  }
  return result.wired
    ? { label: 'postcss config has the kbach plugin', status: 'pass' }
    : {
        label: 'postcss config has the kbach plugin',
        status: 'fail',
        fix: `Run \`npx kbach init\` or add '@kbach/react/postcss': {} to the plugins in ${path}.`,
      };
}

export function checkGlobalsCssMarkers(root: string): DoctorCheckResult {
  const path = findFirstExisting(root, GLOBALS_CSS_CANDIDATES);
  if (!path) {
    return {
      label: 'globals.css has the kbach marker pair',
      status: 'fail',
      fix: 'No app/globals.css, src/app/globals.css, or styles/globals.css found.',
    };
  }
  const source = readFileSync(path, 'utf-8');
  const hasMarkers = source.includes('/* kbach:start */') && source.includes('/* kbach:end */');
  return hasMarkers
    ? { label: 'globals.css has the kbach marker pair', status: 'pass' }
    : {
        label: 'globals.css has the kbach marker pair',
        status: 'fail',
        fix: `Run \`npx kbach init\` or add /* kbach:start */ / /* kbach:end */ to ${path}.`,
      };
}
