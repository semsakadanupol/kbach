import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isKnownToken, describeToken, resolveThemeJsonForDir, invalidateThemeJsonForRoot, setThemeJsonForRoot } from './engine';

describe('isKnownToken', () => {
  it('is true for a real static utility', () => {
    expect(isKnownToken('flex')).toBe(true);
    expect(isKnownToken('p-4')).toBe(true);
  });

  it('is true for a real color utility', () => {
    expect(isKnownToken('bg-blue-6')).toBe(true);
  });

  it('is false for an unknown/typo class', () => {
    expect(isKnownToken('p-4-typo')).toBe(false);
  });

  it('is false for Tailwind\'s shade scale instead of Kbach\'s (the single most likely agent mistake)', () => {
    expect(isKnownToken('bg-blue-500')).toBe(false);
  });

  it('is true for a modifier-prefixed class', () => {
    expect(isKnownToken('dark:bg-blue-6')).toBe(true);
    expect(isKnownToken('sm:flex')).toBe(true);
  });
});

describe('describeToken', () => {
  it('returns the plain declaration for an unwrapped utility', () => {
    expect(describeToken('p-4')).toBe('padding: 16px');
  });

  it('returns null for an unknown class', () => {
    expect(describeToken('p-4-typo')).toBeNull();
  });

  it('returns the inner declaration for a modifier-wrapped (nested) rule', () => {
    // Regression test: a $-anchored "strip the outer wrapper" regex
    // looked right but returned null for every modifier-wrapped rule,
    // since the actual end of the rule STRING is the wrapper's own
    // closing brace, not the declaration block's.
    const result = describeToken('dark:bg-blue-6');
    expect(result).not.toBeNull();
    expect(result).toContain('background-color');
  });
});

describe('resolveThemeJsonForDir', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-vscode-engine-theme-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves to the default theme when the directory has no package.json at all', async () => {
    const themeJson = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-blue-6', themeJson)).toBe(true);
    expect(isKnownToken('bg-brand', themeJson)).toBe(false);
  });

  it('resolves to the default theme when the project has no kbach.config.js', async () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    const themeJson = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-brand', themeJson)).toBe(false);
  });

  it("picks up a project's own kbach.config.js custom color end-to-end", async () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');
    const themeJson = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-brand', themeJson)).toBe(true);
    // Same bg-opacity CSS-variable composition the default palette's own
    // colors get (confirmed earlier, colorEndToEnd.test.ts) — applies
    // identically to a custom config color, not just the built-in ones.
    expect(describeToken('bg-brand', themeJson)).toBe('background-color: rgba(255,107,53,var(--bg-opacity, 1))');
    // the default palette is still there too — extend merges, doesn't replace
    expect(isKnownToken('bg-blue-6', themeJson)).toBe(true);
  });

  it('caches the resolved theme per root — a later edit to the file is not picked up until invalidated', async () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');
    await resolveThemeJsonForDir(dir);
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand2: '#000000' } } };", 'utf-8');
    const stillCached = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-brand', stillCached)).toBe(true);
    expect(isKnownToken('bg-brand2', stillCached)).toBe(false);

    invalidateThemeJsonForRoot(dir);
    const refreshed = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-brand2', refreshed)).toBe(true);
  });

  it('setThemeJsonForRoot forces a cached value directly (used to cache a fallback after a load failure)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    setThemeJsonForRoot(dir, JSON.stringify({ colors: { onlythis: '#fff' }, spacing: {}, screens: {}, fontFamily: {}, darkMode: 'media', container: {} }));
    const themeJson = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-onlythis', themeJson)).toBe(true);
    expect(isKnownToken('bg-blue-6', themeJson)).toBe(false);
  });
});
