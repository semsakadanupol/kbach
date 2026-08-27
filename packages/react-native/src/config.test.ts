import { describe, it, expect, afterEach, vi } from 'vitest';

// applyKbachConfig now also re-syncs darkModeStore.ts's DOM state (see
// resyncDomWithActiveTheme) — this package's real 'react-native' module
// carries Flow syntax Vite's SSR transformer can't parse, so any test file
// that transitively imports darkModeStore.ts needs the same real-native
// mock every other such test file already provides (nativeBridge.test.ts,
// jsx-runtime.test.ts, ...); config.ts had no reason to need one before.
vi.mock('react-native', () => ({
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: vi.fn() }) },
}));

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
    expect(theme.colors['blue-6']).toBe(defaultTheme.colors['blue-6']);
  });

  it('theme.colors REPLACES the default palette entirely', () => {
    const theme = resolveKbachConfig({ theme: { colors: { brand: '#ff6b35' } } });
    expect(theme.colors).toEqual({ brand: '#ff6b35' });
  });

  it('a color value that references another color name resolves to that color', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: 'blue-6' } } });
    expect(theme.colors.brand).toBe(defaultTheme.colors['blue-6']);
  });

  it('a color value can reference a built-in kbach palette color directly, with or without opacity', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: 'orange-5', brandSoft: 'orange-5/50' } } });
    expect(theme.colors.brand).toBe(defaultTheme.colors['orange-5']);
    expect(theme.colors.brandSoft).toBe('rgba(251,146,60,0.5)');
  });

  it('a color reference with an opacity suffix resolves to an rgba() at that opacity', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: '#ff6b35', brandSoft: 'brand/30' } } });
    expect(theme.colors.brandSoft).toBe('rgba(255,107,53,0.3)');
  });

  it('a string that does not match any known color name is treated as a literal CSS value', () => {
    const theme = resolveKbachConfig({ extend: { colors: { accent: 'red' } } });
    expect(theme.colors.accent).toBe('red');
  });

  it('darkMode overrides the strategy', () => {
    expect(resolveKbachConfig({ darkMode: 'class' }).darkMode).toBe('class');
  });

  it('extend.fontFamily adds a new name without dropping the defaults', () => {
    const theme = resolveKbachConfig({ extend: { fontFamily: { display: '"Cal Sans", sans-serif' } } });
    expect(theme.fontFamily?.display).toBe('"Cal Sans", sans-serif');
    expect(theme.fontFamily?.sans).toBe(defaultTheme.fontFamily?.sans);
  });

  it('extend.container merges center/padding on top of the (empty-by-default) container config', () => {
    const theme = resolveKbachConfig({ extend: { container: { center: true, padding: '2rem' } } });
    expect(theme.container).toEqual({ center: true, padding: '2rem' });
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
