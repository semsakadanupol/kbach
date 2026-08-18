import { describe, it, expect, afterEach } from 'vitest';
import { resolveKbachConfig, applyKbachConfig } from './config';
import { defaultTheme, getTheme, setTheme } from './theme';

describe('resolveKbachConfig', () => {
  afterEach(() => {
    setTheme(defaultTheme);
  });

  it('returns defaultTheme unchanged for an empty config', () => {
    expect(resolveKbachConfig({})).toEqual(defaultTheme);
  });

  it('extend.colors adds to the default palette without dropping it', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: '#ff6b35' } } });
    expect(theme.colors.brand).toBe('#ff6b35');
    expect(theme.colors['blue-6']).toBe(defaultTheme.colors['blue-6']); // defaults still present
  });

  it('theme.colors REPLACES the default palette entirely', () => {
    const theme = resolveKbachConfig({ theme: { colors: { brand: '#ff6b35' } } });
    expect(theme.colors).toEqual({ brand: '#ff6b35' });
  });

  it('extend.spacing/screens merge additively', () => {
    const theme = resolveKbachConfig({ extend: { spacing: { '128': 512 }, screens: { '3xl': 1920 } } });
    expect(theme.spacing['128']).toBe(512);
    expect(theme.spacing['4']).toBe(defaultTheme.spacing['4']);
    expect(theme.screens['3xl']).toBe(1920);
    expect(theme.screens.sm).toBe(defaultTheme.screens.sm);
  });

  it('darkMode overrides the strategy', () => {
    expect(resolveKbachConfig({ darkMode: 'class' }).darkMode).toBe('class');
    expect(resolveKbachConfig({}).darkMode).toBe(defaultTheme.darkMode);
  });

  it('extend.fontFamily adds a new name without dropping the defaults', () => {
    const theme = resolveKbachConfig({ extend: { fontFamily: { display: '"Cal Sans", sans-serif' } } });
    expect(theme.fontFamily?.display).toBe('"Cal Sans", sans-serif');
    expect(theme.fontFamily?.sans).toBe(defaultTheme.fontFamily?.sans);
  });

  it('extend.fontFamily can override one of the three default names', () => {
    const theme = resolveKbachConfig({ extend: { fontFamily: { sans: 'Inter, sans-serif' } } });
    expect(theme.fontFamily?.sans).toBe('Inter, sans-serif');
    expect(theme.fontFamily?.mono).toBe(defaultTheme.fontFamily?.mono);
  });

  it('theme.fontFamily REPLACES the default font stacks entirely', () => {
    const theme = resolveKbachConfig({ theme: { fontFamily: { sans: 'Inter, sans-serif' } } });
    expect(theme.fontFamily).toEqual({ sans: 'Inter, sans-serif' });
  });

  it('extend.container merges center/padding on top of the (empty-by-default) container config', () => {
    const theme = resolveKbachConfig({ extend: { container: { center: true, padding: '2rem' } } });
    expect(theme.container).toEqual({ center: true, padding: '2rem' });
  });

  it('container is empty by default, matching real Tailwind\'s own defaults', () => {
    expect(resolveKbachConfig({}).container).toEqual({});
  });

  it('a color value that references another color name resolves to that color, not a literal string', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: 'blue-6' } } });
    expect(theme.colors.brand).toBe(defaultTheme.colors['blue-6']);
  });

  it('a color value can reference a built-in kbach palette color directly, with or without opacity', () => {
    // The 22-family default palette is already IN theme.colors by the time
    // extend.colors resolves (resolveKbachConfig merges defaultTheme first)
    // — so a reference doesn't need to be declared earlier in the SAME
    // extend.colors object the way a custom alias does; every default
    // palette name is already available to reference from the start.
    const theme = resolveKbachConfig({ extend: { colors: { brand: 'orange-5', brandSoft: 'orange-5/50' } } });
    expect(theme.colors.brand).toBe(defaultTheme.colors['orange-5']);
    expect(theme.colors.brandSoft).toBe('rgba(251,146,60,0.5)');
  });

  it('a color reference with an opacity suffix resolves to an rgba() at that opacity', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: '#ff6b35', brandSoft: 'brand/30' } } });
    expect(theme.colors.brandSoft).toBe('rgba(255,107,53,0.3)');
  });

  it('an opacity alias chain resolves correctly when declared in dependency order', () => {
    const theme = resolveKbachConfig({
      extend: { colors: { brand: '#ff6b35', brandSoft: 'brand/50', brandSofter: 'brandSoft/50' } },
    });
    // brandSoft is itself an rgba() string by the time brandSofter resolves
    // against it — applyOpacityToHex only decomposes real hex, so a
    // reference to an ALREADY-rgba'd alias just passes through unchanged
    // rather than double-applying opacity incorrectly.
    expect(theme.colors.brandSoft).toBe('rgba(255,107,53,0.5)');
  });

  it('a mode-aware color reference resolves both sides at the given opacity', () => {
    const theme = resolveKbachConfig({
      extend: {
        colors: {
          surface: { light: '#f9fafb', dark: '#111827' },
          surfaceSoft: 'surface/50',
        },
      },
    });
    expect(theme.colors.surfaceSoft).toEqual({ light: 'rgba(249,250,251,0.5)', dark: 'rgba(17,24,39,0.5)' });
  });

  it('a string that does not match any known color name is treated as a literal CSS value', () => {
    const theme = resolveKbachConfig({ extend: { colors: { accent: 'red' } } });
    expect(theme.colors.accent).toBe('red');
  });

  it('a mode-aware color object passes through unchanged (no aliasing on an object value)', () => {
    const theme = resolveKbachConfig({ extend: { colors: { surface: { light: '#fff', dark: '#000' } } } });
    expect(theme.colors.surface).toEqual({ light: '#fff', dark: '#000' });
  });
});

describe('applyKbachConfig', () => {
  afterEach(() => {
    setTheme(defaultTheme);
  });

  it('resolves the config AND calls setTheme() with the result', () => {
    const theme = applyKbachConfig({ extend: { colors: { brand: '#ff6b35' } } });
    expect(getTheme()).toBe(theme);
    expect(getTheme().colors.brand).toBe('#ff6b35');
  });
});
