import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findProjectRoot } from './projectRoot';

describe('findProjectRoot', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-vscode-root-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the directory itself when it has a package.json', () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    expect(findProjectRoot(dir)).toBe(dir);
  });

  it('walks up from a nested directory to find the nearest package.json', () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    const nested = join(dir, 'src', 'components');
    mkdirSync(nested, { recursive: true });
    expect(findProjectRoot(nested)).toBe(dir);
  });

  it('prefers the nearest package.json over a further-up one', () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    const appDir = join(dir, 'packages', 'mobile');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, 'package.json'), '{}', 'utf-8');
    expect(findProjectRoot(join(appDir, 'src'))).toBe(appDir);
  });
});
