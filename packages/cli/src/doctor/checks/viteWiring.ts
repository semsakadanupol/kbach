import { readFileSync } from 'node:fs';
import { isViteConfigWired } from '../../codemods/viteConfig';
import { findFirstExisting } from '../../fsFind';
import type { DoctorCheckResult } from '../types';

const VITE_CONFIG_NAMES = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];

export function checkViteConfigWiring(root: string): DoctorCheckResult {
  const path = findFirstExisting(root, VITE_CONFIG_NAMES);
  if (!path) {
    return {
      label: 'vite.config has the kbach() plugin',
      status: 'fail',
      fix: 'No vite.config.{ts,js,mts,mjs} found at the project root.',
    };
  }
  const result = isViteConfigWired(readFileSync(path, 'utf-8'));
  if (!result.ok) {
    return {
      label: 'vite.config has the kbach() plugin',
      status: 'fail',
      fix: `Couldn't verify automatically (${result.reason}) — confirm \`kbach()\` appears in the plugins array in ${path}, before react().`,
    };
  }
  return result.wired
    ? { label: 'vite.config has the kbach() plugin', status: 'pass' }
    : {
        label: 'vite.config has the kbach() plugin',
        status: 'fail',
        fix: `Run \`npx @kbach/cli init\` or add \`kbach()\` (before react()) to the plugins array in ${path}.`,
      };
}
