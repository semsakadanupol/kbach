import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPackageInstalled } from './packageInstalled';

// Regression test for a real bug: an earlier version only checked
// `<root>/node_modules/<pkg>`, which false-failed every workspace-hoisted
// install (npm/pnpm/yarn workspaces commonly hoist a dependency up to a
// parent node_modules rather than installing it into the project's own —
// confirmed live against this monorepo's own apps/web-sandbox, which
// resolves @kbach/react from two directories up).
describe('checkPackageInstalled', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'kbach-cli-test-'));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('finds a hoisted install in a grandparent node_modules', () => {
    const hoistedPkgDir = join(base, 'node_modules', '@kbach', 'react');
    mkdirSync(hoistedPkgDir, { recursive: true });
    writeFileSync(join(hoistedPkgDir, 'package.json'), JSON.stringify({ version: '1.0.0-beta.24' }));

    const project = join(base, 'apps', 'web-sandbox');
    mkdirSync(project, { recursive: true });

    const result = checkPackageInstalled(project, '@kbach/react');
    expect(result).toEqual({ label: '@kbach/react installed', status: 'pass', detail: '1.0.0-beta.24' });
  });

  it('prefers the project\'s own node_modules over a hoisted one further up', () => {
    const hoisted = join(base, 'node_modules', '@kbach', 'react');
    mkdirSync(hoisted, { recursive: true });
    writeFileSync(join(hoisted, 'package.json'), JSON.stringify({ version: '1.0.0-beta.1' }));

    const project = join(base, 'apps', 'web-sandbox');
    const local = join(project, 'node_modules', '@kbach', 'react');
    mkdirSync(local, { recursive: true });
    writeFileSync(join(local, 'package.json'), JSON.stringify({ version: '1.0.0-beta.24' }));

    const result = checkPackageInstalled(project, '@kbach/react');
    expect(result.status).toBe('pass');
    expect(result.detail).toBe('1.0.0-beta.24');
  });

  it('fails with an install fix when the package is nowhere on the ancestor chain', () => {
    const project = join(base, 'apps', 'web-sandbox');
    mkdirSync(project, { recursive: true });

    const result = checkPackageInstalled(project, '@kbach/react');
    expect(result.status).toBe('fail');
    expect(result.fix).toBe('npm install @kbach/react@beta');
  });
});
