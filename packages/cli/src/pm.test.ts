import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

  it('finds a lockfile at the monorepo root when run from a nested app directory', () => {
    // Regression test for a real gap: the lockfile conventionally lives
    // at the WORKSPACE root in a monorepo, not inside the individual app
    // you actually run `kbach init`/`doctor` from — checking only the
    // exact given directory silently defaulted to npm even on a real
    // pnpm/yarn/bun monorepo.
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    const nested = join(dir, 'apps', 'mobile');
    mkdirSync(nested, { recursive: true });
    expect(detectPackageManager(nested)).toBe('pnpm');
  });

  it('prefers a lockfile in the project\'s own directory over one further up', () => {
    writeFileSync(join(dir, 'yarn.lock'), '');
    const nested = join(dir, 'apps', 'mobile');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(nested)).toBe('pnpm');
  });
});
