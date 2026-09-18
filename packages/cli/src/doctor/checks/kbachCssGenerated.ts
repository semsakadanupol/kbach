import { readFileSync, statSync } from 'node:fs';
import { findKbachCssFile } from '../../findKbachCss';
import { findEntryFile, hasKbachCssImport } from '../../codemods/entryImport';
import type { DoctorCheckResult } from '../types';

export function checkKbachCssGenerated(root: string): DoctorCheckResult {
  const cssPath = findKbachCssFile(root);
  if (!cssPath) {
    return {
      label: 'kbach.css exists',
      status: 'fail',
      fix: "None found — it's generated on first dev-server start/build. Run your dev server once, or check the plugin's `cssFile` option if you passed one.",
    };
  }
  if (statSync(cssPath).size === 0) {
    return {
      label: 'kbach.css exists',
      status: 'fail',
      fix: `${cssPath} is empty — start the dev server once so the plugin can fill it.`,
    };
  }

  const entryPath = findEntryFile(root);
  if (!entryPath) {
    return {
      label: 'kbach.css exists and is imported',
      status: 'fail',
      fix: `Found ${cssPath}, but no src/main.{tsx,ts,jsx,js} or app/root.{tsx,ts} to check for its import — confirm you import it once from your entry point.`,
    };
  }
  const imported = hasKbachCssImport(readFileSync(entryPath, 'utf-8'));
  return imported
    ? { label: 'kbach.css exists and is imported', status: 'pass' }
    : {
        label: 'kbach.css exists and is imported',
        status: 'fail',
        fix: `Found ${cssPath}, but ${entryPath} doesn't import it. Add: import './kbach.css';`,
      };
}
