import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolve, flatten, generateClassCSS } from './resolver';
import { buildConfig } from './config';
import type { ResolvedConfig, ThemeColors } from './types';

/** Read a resolved family-shade hex out of a built theme's colors map. */
function shade(colors: ThemeColors, family: string, n: string): string {
  return (colors[family] as Record<string, string>)[n];
}

// Plain Node (no DOM/jsdom): getEffectiveIsWeb() defaults to true here (see
// platform.ts), so resolve()'s CSS-injection side effect runs, but injectRule()
// swallows the ReferenceError from a missing `document` — harmless for these
// tests, which only assert on resolve()/flatten()/generateClassCSS()'s return
// values, not on anything actually landing in a <style> sheet.

// On web, color utilities wrap their resolved hex in a composable opacity
// CSS var (e.g. `bg-{color}` pairs with `bg-opacity-*`) rather than emitting
// the raw hex — see resolvers/color.ts's withOpacityVar(). Reproduced here
// (from a hex string, not hardcoded per-color) so these tests stay correct
// if the default theme's palette values ever change.
function toRgbaVar(hex: string, varName: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},var(${varName},1))`;
}

describe('resolve()', () => {
  let config: ResolvedConfig;
  beforeEach(() => {
    // Fresh theme object per test — resolve()'s cache is a WeakMap keyed by
    // theme identity, so this also gives each test an isolated cache.
    config = buildConfig({});
  });

  it('resolves a plain scale utility into the "base" bucket', () => {
    const result = resolve('p-4', config.theme, config.darkMode);
    expect(result.base).toEqual({ padding: 16 });
  });

  it('resolves a color utility to the theme\'s resolved color, opacity-var wrapped', () => {
    const result = resolve('bg-blue-6', config.theme, config.darkMode);
    expect(result.base).toEqual({
      backgroundColor: toRgbaVar(shade(config.theme.colors, 'blue', '6'), '--bg-opacity'),
    });
  });

  it('buckets a modifier-prefixed class under its modifier key, not "base"', () => {
    const result = resolve('dark:bg-blue-6', config.theme, config.darkMode);
    expect(result.base).toBeUndefined();
    expect(result.dark).toEqual({
      backgroundColor: toRgbaVar(shade(config.theme.colors, 'blue', '6'), '--bg-opacity'),
    });
  });

  it('merges multiple classes sharing the same bucket', () => {
    const result = resolve('p-4 rounded', config.theme, config.darkMode);
    expect(result.base).toMatchObject({ padding: 16, borderRadius: 4 });
  });

  it('joins chained modifiers into a single colon-separated bucket key', () => {
    const result = resolve('sm:dark:bg-blue-6', config.theme, config.darkMode);
    expect(Object.keys(result)).toEqual(['sm:dark']);
  });

  it('ignores unknown classes without throwing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => resolve('totally-not-a-real-class-xyz', config.theme, config.darkMode)).not.toThrow();
    const result = resolve('totally-not-a-real-class-xyz', config.theme, config.darkMode);
    warnSpy.mockRestore();
    expect(result).toEqual({});
  });

  it('caches by (classString, theme, darkMode): repeated calls return the same object reference', () => {
    const first = resolve('p-4 bg-blue-6', config.theme, config.darkMode);
    const second = resolve('p-4 bg-blue-6', config.theme, config.darkMode);
    expect(second).toBe(first);
  });

  it('keeps caches for different theme objects independent', () => {
    const otherConfig = buildConfig({ extend: { theme: { colors: { blue: { 6: '#010203' } } } } });
    const a = resolve('bg-blue-6', config.theme, config.darkMode);
    const b = resolve('bg-blue-6', otherConfig.theme, otherConfig.darkMode);
    expect(a.base).not.toEqual(b.base);
    expect((b.base as Record<string, unknown>).backgroundColor).toBe(toRgbaVar('#010203', '--bg-opacity'));
  });

  it('caches separately per darkMode strategy even for the same classString/theme', () => {
    const attr = resolve('dark:bg-blue-6', config.theme, 'attribute');
    const cls = resolve('dark:bg-blue-6', config.theme, 'class');
    expect(attr).not.toBe(cls);
    // Same resolved VALUE either way — only the CSS injection format differs, not the value.
    expect(attr.dark).toEqual(cls.dark);
  });
});

describe('flatten()', () => {
  let config: ResolvedConfig;
  beforeEach(() => { config = buildConfig({}); });

  it('always applies the base bucket', () => {
    const resolved = resolve('p-4', config.theme, config.darkMode);
    expect(flatten(resolved, false)).toEqual({ padding: 16 });
  });

  it('applies the dark bucket only when isDark is true, overriding base', () => {
    const resolved = resolve('bg-red-6 dark:bg-blue-6', config.theme, config.darkMode);
    const light = flatten(resolved, false);
    const dark = flatten(resolved, true);
    expect(light.backgroundColor).toBe(toRgbaVar(shade(config.theme.colors, 'red', '6'), '--bg-opacity'));
    expect(dark.backgroundColor).toBe(toRgbaVar(shade(config.theme.colors, 'blue', '6'), '--bg-opacity'));
  });

  it('applies an interactive-state bucket only when that state is active', () => {
    const resolved = resolve('hover:bg-blue-6', config.theme, config.darkMode);
    expect(flatten(resolved, false, {}).backgroundColor).toBeUndefined();
    expect(flatten(resolved, false, { hover: true }).backgroundColor).toBe(
      toRgbaVar(shade(config.theme.colors, 'blue', '6'), '--bg-opacity'),
    );
  });

  it('expands RN shorthand properties to explicit CSS keys off-native (web/SSR)', () => {
    const resolved = resolve('px-4', config.theme, config.darkMode);
    const flat = flatten(resolved, false) as Record<string, unknown>;
    expect(flat.paddingHorizontal).toBeUndefined();
    expect(flat.paddingLeft).toBe(16);
    expect(flat.paddingRight).toBe(16);
  });
});

describe('generateClassCSS()', () => {
  let config: ResolvedConfig;
  beforeEach(() => { config = buildConfig({}); });

  it('emits an exact base-bucket rule for a simple selector-safe class', () => {
    const css = generateClassCSS('p-4', config.theme, config.darkMode);
    expect(css).toBe('.p-4 { padding: 16px }');
  });

  it('wraps a dark-scheme class per the "attribute" strategy', () => {
    const css = generateClassCSS('dark:bg-blue-6', config.theme, 'attribute');
    expect(css.startsWith('[data-theme="dark"] ')).toBe(true);
    expect(css).toContain(`background-color: ${toRgbaVar(shade(config.theme.colors, 'blue', '6'), '--bg-opacity')}`);
  });

  it('wraps a dark-scheme class per the "class" strategy', () => {
    const css = generateClassCSS('dark:bg-blue-6', config.theme, 'class');
    expect(css.startsWith('.dark ')).toBe(true);
  });

  it('wraps a dark-scheme class per the "media" strategy', () => {
    const css = generateClassCSS('dark:bg-blue-6', config.theme, 'media');
    expect(css.startsWith('@media (prefers-color-scheme: dark) { ')).toBe(true);
  });

  it('returns an empty string for a class string with no resolvable classes', () => {
    expect(generateClassCSS('not-a-real-class', config.theme, config.darkMode)).toBe('');
  });
});
