import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectPackageManager } from './pm';

describe('detectPackageManager', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-cli-pm-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('defaults to npm when no lockfile is present', () => {
    expect(detectPackageManager(dir)).toBe('npm');
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(dir)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    writeFileSync(join(dir, 'yarn.lock'), '');
    expect(detectPackageManager(dir)).toBe('yarn');
  });

  it('detects bun from bun.lock', () => {
    writeFileSync(join(dir, 'bun.lock'), '');
    expect(detectPackageManager(dir)).toBe('bun');
  });

  it('detects npm from package-lock.json', () => {
    writeFileSync(join(dir, 'package-lock.json'), '');
    expect(detectPackageManager(dir)).toBe('npm');
  });
});
