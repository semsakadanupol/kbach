import { describe, it, expect } from 'vitest';
import { toCdnTheme } from './cdnTheme';
import { defaultTheme, type ThemeConfig } from '../../react/src/theme';

const theme = (colors: ThemeConfig['colors']): ThemeConfig => ({ ...defaultTheme, colors });

describe('toCdnTheme', () => {
  it('replaces a hex { light, dark } pair with its CSS-variable reference', () => {
    const out = toCdnTheme(theme({ surface: { light: '#f9fafb', dark: '#111827' }, brand: '#ff6b35' }));
    expect(out.colors.surface).toBe('rgb(var(--kb-color-surface))');
    expect(out.colors.brand).toBe('#ff6b35');
  });

  it('leaves a pair alone when either side is not hex (no variable would exist for it)', () => {
    const pair = { light: 'gray-2', dark: '#111827' };
    expect(toCdnTheme(theme({ surface: pair })).colors.surface).toBe(pair);
  });

  it('returns the same object when there is nothing to replace', () => {
    const t = theme({ brand: '#ff6b35' });
    expect(toCdnTheme(t)).toBe(t);
  });

  it("maps @kbach/react's own default surface color", () => {
    expect(toCdnTheme(defaultTheme).colors.surface).toBe('rgb(var(--kb-color-surface))');
  });
});
