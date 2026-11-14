import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isKnownToken, describeToken, suggestFromEngine, resolveThemeJsonForDir, invalidateThemeJsonForRoot, DEFAULT_THEME_JSON } from './engine';

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

describe('isKnownToken — classes that used to be underlined by mistake', () => {
  it('accepts group/peer markers, named or not', () => {
    for (const t of ['group', 'peer', 'group/code', 'peer/field']) expect(isKnownToken(t)).toBe(true);
    expect(isKnownToken('group/')).toBe(false);
    expect(isKnownToken('groups')).toBe(false);
  });

  it('accepts a light/dark theme color on every color utility (ring-, decoration-, …)', () => {
    const theme = JSON.parse(DEFAULT_THEME_JSON);
    theme.colors.line = { light: '#e4dccb', dark: '#33424a' };
    theme.colors.accent = { light: '#87642f', dark: '#d6b46f' };
    const json = JSON.stringify(theme);
    for (const t of ['bg-line', 'ring-line', 'border-line', 'decoration-accent/40', 'hover:decoration-accent', 'shadow-accent/10']) {
      expect(isKnownToken(t, json), t).toBe(true);
    }
    expect(isKnownToken('ring-nope', json)).toBe(false);
  });
});

describe('suggestFromEngine', () => {
  it('maps a Tailwind shade to the Kbach one, keeping modifiers and opacity', () => {
    expect(suggestFromEngine('bg-blue-500')).toBe('bg-blue-6');
    expect(suggestFromEngine('hover:text-gray-900/50')).toBe('hover:text-gray-10/50');
  });

  it('fixes a one-character typo the scraped word list could miss', () => {
    expect(suggestFromEngine('flexx')).toBe('flex');
    expect(suggestFromEngine('dark:itms-center')).toBe('dark:items-center');
  });

  it('gives nothing for a real class or a made-up one', () => {
    expect(suggestFromEngine('flex')).toBeNull();
    expect(suggestFromEngine('completely-made-up-thing')).toBeNull();
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

  it('a failed load rejects for its caller, then serves the default theme until invalidated (no re-attempt per keystroke)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), 'module.exports = { extend: { colors: { brand: ', 'utf-8');
    await expect(resolveThemeJsonForDir(dir)).rejects.toThrow();
    // let the cache swap its rejected entry for the fallback
    await new Promise((r) => setTimeout(r, 0));
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');
    const fallback = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-blue-6', fallback)).toBe(true);
    expect(isKnownToken('bg-brand', fallback)).toBe(false);

    invalidateThemeJsonForRoot(dir);
    expect(isKnownToken('bg-brand', await resolveThemeJsonForDir(dir))).toBe(true);
  });

  it('concurrent first requests share ONE load (the in-flight promise is cached, not just the result)', async () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');
    const a = resolveThemeJsonForDir(dir);
    const b = resolveThemeJsonForDir(dir);
    expect(b).toBe(a);
    await a;
  });

  it('a load still in flight when the root is invalidated never writes its stale result back into the cache', async () => {
    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.mjs'), "export default { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');
    const stale = resolveThemeJsonForDir(dir);
    // the "save" lands while the first (async import()) load is still pending
    writeFileSync(join(dir, 'kbach.config.mjs'), "export default { extend: { colors: { brand2: '#000000' } } };", 'utf-8');
    invalidateThemeJsonForRoot(dir);
    await stale;
    const fresh = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-brand2', fresh)).toBe(true);
    expect(isKnownToken('bg-brand', fresh)).toBe(false);
  });

  it("a @kbach/react project gets that binding's default surface color; a native or binding-less one doesn't", async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@kbach/react': '1.0.0' } }), 'utf-8');
    expect(isKnownToken('bg-surface', await resolveThemeJsonForDir(dir))).toBe(true);

    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@kbach/react-native': '1.0.0', '@kbach/react': '1.0.0' } }), 'utf-8');
    invalidateThemeJsonForRoot(dir);
    expect(isKnownToken('bg-surface', await resolveThemeJsonForDir(dir))).toBe(false);

    writeFileSync(join(dir, 'package.json'), '{}', 'utf-8');
    invalidateThemeJsonForRoot(dir);
    expect(isKnownToken('bg-surface', await resolveThemeJsonForDir(dir))).toBe(false);
  });

  it("a @kbach/react project's kbach.config.js merges over the WEB default (surface survives extend)", async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ devDependencies: { '@kbach/react': '1.0.0' } }), 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');
    const themeJson = await resolveThemeJsonForDir(dir);
    expect(isKnownToken('bg-surface', themeJson)).toBe(true);
    expect(isKnownToken('bg-brand', themeJson)).toBe(true);
  });
});
