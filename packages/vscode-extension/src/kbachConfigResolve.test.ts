import { describe, it, expect } from 'vitest';
import { resolveKbachConfig } from './kbachConfigResolve';
import { DEFAULT_THEME } from './defaultTheme';

const base = DEFAULT_THEME;

describe('resolveKbachConfig', () => {
  it('returns the base theme unchanged for an empty config', () => {
    expect(resolveKbachConfig({}, base)).toEqual(base);
  });

  it('merges a literal hex custom color via extend.colors', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: '#ff6b35' } } }, base);
    expect(theme.colors.brand).toBe('#ff6b35');
    // the default palette is still there — extend merges, doesn't replace
    expect(theme.colors['blue-6']).toBe(base.colors['blue-6']);
  });

  it('resolves a color reference to a built-in palette entry', () => {
    const theme = resolveKbachConfig({ extend: { colors: { accent: 'blue-6' } } }, base);
    expect(theme.colors.accent).toBe(base.colors['blue-6']);
  });

  it('resolves an opacity-suffixed reference to a built-in palette entry', () => {
    const theme = resolveKbachConfig({ extend: { colors: { accentSoft: 'blue-6/50' } } }, base);
    expect(theme.colors.accentSoft).toBe('rgba(59,130,246,0.5)');
  });

  it('resolves a reference to a custom color defined earlier in the same object', () => {
    const theme = resolveKbachConfig({ extend: { colors: { brand: '#ff6b35', brandSoft: 'brand/30' } } }, base);
    expect(theme.colors.brandSoft).toBe('rgba(255,107,53,0.3)');
  });

  it('treats an unknown name as a literal CSS value', () => {
    const theme = resolveKbachConfig({ extend: { colors: { danger: 'red' } } }, base);
    expect(theme.colors.danger).toBe('red');
  });

  it('builds a mode-aware color from per-color light/dark pair', () => {
    const theme = resolveKbachConfig({ extend: { colors: { surface: { light: '#f9fafb', dark: '#111827' } } } }, base);
    expect(theme.colors.surface).toEqual({ light: '#f9fafb', dark: '#111827' });
  });

  it('builds a mode-aware color from the grouped dark block', () => {
    const theme = resolveKbachConfig(
      { extend: { colors: { surface: 'gray-2', card: 'white', dark: { surface: 'gray-11', card: 'gray-9' } } } },
      base,
    );
    expect(theme.colors.surface).toEqual({ light: base.colors['gray-2'], dark: base.colors['gray-11'] });
    expect(theme.colors.card).toEqual({ light: base.colors.white, dark: base.colors['gray-9'] });
  });

  it('merges extend.spacing on top of the base scale', () => {
    const theme = resolveKbachConfig({ extend: { spacing: { '128': 512 } } }, base);
    expect(theme.spacing['128']).toBe(512);
  });

  it('merges extend.screens on top of the base breakpoints', () => {
    const theme = resolveKbachConfig({ extend: { screens: { '3xl': 1920 } } }, base);
    expect(theme.screens['3xl']).toBe(1920);
    expect(theme.screens.sm).toBe(base.screens.sm);
  });

  it('theme.colors REPLACES the default palette entirely, unlike extend.colors', () => {
    const theme = resolveKbachConfig({ theme: { colors: { brand: '#ff6b35' } } }, base);
    expect(theme.colors).toEqual({ brand: '#ff6b35' });
  });

  it('applies a darkMode override', () => {
    const theme = resolveKbachConfig({ darkMode: 'class' }, base);
    expect(theme.darkMode).toBe('class');
  });
});
