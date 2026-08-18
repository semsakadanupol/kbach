import { describe, it, expect, beforeEach } from 'vitest';
import { ensureColorVariablesInjected, parseHexRgb, _resetForTests } from './colorVariables';
import type { ThemeConfig } from './theme';

function theme(overrides: Partial<ThemeConfig> = {}): ThemeConfig {
  return {
    colors: {},
    spacing: {},
    screens: {},
    darkMode: 'attribute',
    ...overrides,
  };
}

describe('parseHexRgb', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(parseHexRgb('#2563eb')).toEqual([37, 99, 235]);
    expect(parseHexRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('returns null for a non-hex string', () => {
    expect(parseHexRgb('rgb(0,0,0)')).toBeNull();
    expect(parseHexRgb('currentColor')).toBeNull();
  });
});

describe('ensureColorVariablesInjected', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('emits no <style> tag at all when nothing is mode-aware', () => {
    ensureColorVariablesInjected(theme({ colors: { 'blue-6': '#2563eb' } }));
    expect(document.getElementById('kbach-colors')).toBeNull();
  });

  it('emits a root/dark-attribute variable pair for a mode-aware hex color', () => {
    ensureColorVariablesInjected(
      theme({ colors: { surface: { light: '#f9fafb', dark: '#111827' } } }),
    );
    const el = document.getElementById('kbach-colors')!;
    expect(el).not.toBeNull();
    expect(el.textContent).toContain(':root { --kb-color-surface: 249,250,251; }');
    expect(el.textContent).toContain('[data-theme="dark"] { --kb-color-surface: 17,24,39; }');
  });

  it('wraps the dark declarations for the class strategy', () => {
    ensureColorVariablesInjected(
      theme({ darkMode: 'class', colors: { surface: { light: '#f9fafb', dark: '#111827' } } }),
    );
    expect(document.getElementById('kbach-colors')!.textContent).toContain('.dark { --kb-color-surface:');
  });

  it('wraps the dark declarations for the media strategy', () => {
    ensureColorVariablesInjected(
      theme({ darkMode: 'media', colors: { surface: { light: '#f9fafb', dark: '#111827' } } }),
    );
    expect(document.getElementById('kbach-colors')!.textContent).toContain(
      '@media (prefers-color-scheme: dark) { :root { --kb-color-surface:',
    );
  });

  it('is a no-op when called again with the exact same theme object', () => {
    const t = theme({ colors: { surface: { light: '#f9fafb', dark: '#111827' } } });
    ensureColorVariablesInjected(t);
    const first = document.getElementById('kbach-colors')!.textContent;
    document.getElementById('kbach-colors')!.textContent = 'mutated by a test';
    ensureColorVariablesInjected(t);
    expect(document.getElementById('kbach-colors')!.textContent).toBe('mutated by a test');
    expect(first).toContain('--kb-color-surface');
  });

  it('re-injects when called with a different theme object', () => {
    ensureColorVariablesInjected(theme({ colors: { surface: { light: '#f9fafb', dark: '#111827' } } }));
    ensureColorVariablesInjected(theme({ colors: { accent: { light: '#000000', dark: '#ffffff' } } }));
    const text = document.getElementById('kbach-colors')!.textContent!;
    expect(text).toContain('--kb-color-accent');
    expect(text).not.toContain('--kb-color-surface');
  });

  it('skips a mode-aware entry whose values are not parseable hex', () => {
    ensureColorVariablesInjected(theme({ colors: { weird: { light: 'rgb(0,0,0)', dark: 'hsl(0,0%,100%)' } } }));
    expect(document.getElementById('kbach-colors')).toBeNull();
  });
});
