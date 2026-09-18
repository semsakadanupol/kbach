import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';
import type { DoctorCheckResult } from '../types';

/** Parse-only (never `require()`s the file, which would execute it) — same
 * "unquoted-hyphenated-key" trap both AGENTS.md files call out is a real
 * SyntaxError at this level, not something that needs special-casing. */
export function checkConfigSyntax(root: string): DoctorCheckResult | null {
  const path = join(root, 'kbach.config.js');
  if (!existsSync(path)) return null; // no config file is a valid, common state — not a failure.

  const source = readFileSync(path, 'utf-8');
  try {
    parse(source, { sourceType: 'unambiguous', plugins: ['typescript'] });
    return { label: 'kbach.config.js parses', status: 'pass' };
  } catch (err) {
    const message = (err as Error).message;
    const hint = /-/.test(source)
      ? ' If an object key contains a hyphen (e.g. surface-dim), quote it: \'surface-dim\'.'
      : '';
    return {
      label: 'kbach.config.js parses',
      status: 'fail',
      fix: `${path}: ${message}${hint}`,
    };
  }
}
