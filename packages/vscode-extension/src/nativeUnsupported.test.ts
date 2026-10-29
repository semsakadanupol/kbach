import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isReactNativeProject, nativeUnsupportedReason } from './nativeUnsupported';

describe('isReactNativeProject', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-vscode-rn-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is false when there is no package.json at all', () => {
    expect(isReactNativeProject(dir)).toBe(false);
  });

  it('is false for a plain web project', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '^19.0.0', vite: '^5.0.0' } }));
    expect(isReactNativeProject(dir)).toBe(false);
  });

  it('is true for a react-native dependency', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-native': '^0.87.0' } }));
    expect(isReactNativeProject(dir)).toBe(true);
  });

  it('is true for an expo dependency', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { expo: '~51.0.0' } }));
    expect(isReactNativeProject(dir)).toBe(true);
  });

  it('finds a react-native package.json from a nested src directory (monorepo case)', () => {
    // Mirrors @kbach/cli's own pm.test.ts regression: the file being
    // edited lives several directories below the package root (e.g.
    // packages/react-native/src/components/Foo.tsx), so the check must
    // walk UP to find that package's package.json, not stop at the
    // nested directory itself.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { 'react-native': '^0.87.0' } }));
    const nested = join(dir, 'src', 'components');
    mkdirSync(nested, { recursive: true });
    expect(isReactNativeProject(nested)).toBe(true);
  });

  it('prefers the nearest package.json over a further-up one (monorepo root has no react-native dep)', () => {
    // The monorepo-root scenario this whole walk-up was built for: the
    // workspace root's own package.json has neither dependency, but the
    // nested package being edited does — nearest must win.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { turbo: '^2.0.0' } }));
    const appDir = join(dir, 'packages', 'mobile');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ dependencies: { expo: '~51.0.0' } }));
    expect(isReactNativeProject(join(appDir, 'src'))).toBe(true);
  });
});

describe('nativeUnsupportedReason', () => {
  it('flags group-* modifiers', () => {
    expect(nativeUnsupportedReason('group-hover:bg-red-6')).toContain('group-hover:');
  });

  it('flags peer-* modifiers', () => {
    expect(nativeUnsupportedReason('peer-checked:text-emerald-6')).toContain('peer-checked:');
  });

  it('flags has-[...] modifiers', () => {
    expect(nativeUnsupportedReason('has-[:checked]:border-emerald-6')).toContain('has-[:checked]:');
  });

  it('flags container-query (@) modifiers', () => {
    expect(nativeUnsupportedReason('@sm:flex')).toContain('@sm:');
  });

  it('flags before:/after: pseudo-element modifiers', () => {
    expect(nativeUnsupportedReason('before:content-[Hi]')).toContain('before:');
    expect(nativeUnsupportedReason('after:block')).toContain('after:');
  });

  it('flags grid base utilities', () => {
    expect(nativeUnsupportedReason('grid-cols-3')).toContain('grid-cols-3');
    expect(nativeUnsupportedReason('col-span-2')).toContain('col-span-2');
  });

  it('does not flag ordinary, fully-supported native modifiers', () => {
    expect(nativeUnsupportedReason('dark:bg-blue-6')).toBeNull();
    expect(nativeUnsupportedReason('hover:bg-blue-7')).toBeNull();
    expect(nativeUnsupportedReason('sm:flex')).toBeNull();
    expect(nativeUnsupportedReason('active:bg-blue-8')).toBeNull();
  });

  it('does not flag the plain "container" utility (which DOES work on native)', () => {
    // Distinct from the @container query VARIANT, which doesn't — see
    // root AGENTS.md's own extend.container note.
    expect(nativeUnsupportedReason('container')).toBeNull();
  });

  it('does not flag ordinary classes at all', () => {
    expect(nativeUnsupportedReason('flex')).toBeNull();
    expect(nativeUnsupportedReason('p-4')).toBeNull();
    expect(nativeUnsupportedReason('bg-blue-6')).toBeNull();
  });
});
