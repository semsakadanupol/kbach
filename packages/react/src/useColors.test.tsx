import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { setTheme, defaultTheme } from './theme';
import { _resetForTests as resetColorVars } from './colorVariables';
import { _resetForTests as resetDarkMode } from './darkModeStore';

function mockMatchMedia(prefersDark: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('useColors', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockMatchMedia(false);
    resetColorVars();
    resetDarkMode();
    setTheme({
      ...defaultTheme,
      colors: {
        'blue-6': '#2563eb',
        white: '#ffffff',
        surface: { light: '#f9fafb', dark: '#111827' },
        // A shade-family entry can be defined mode-aware too — proves this
        // is a per-color, manual choice in the theme config, not something
        // baked into shade-family access specifically.
        'blue-9': { light: '#1e3a8a', dark: '#93c5fd' },
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setTheme(defaultTheme);
  });

  function render<T>(use: () => T): T {
    let captured!: T;
    function Probe() {
      captured = use();
      return null;
    }
    root = createRoot(container);
    act(() => root.render(<Probe />));
    return captured;
  }

  it('resolves a shade-family lookup to the raw hex', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    expect(colors.blue[6]).toBe('#2563eb');
  });

  it('resolves a shade-family opacity lookup', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    const blue = colors.blue as import('./useColors').ColorScale;
    expect(blue['6/50']).toBe('rgba(37,99,235,0.5)');
  });

  it('resolves a flat color and a flat opacity lookup', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    expect(colors.white).toBe('#ffffff');
    expect(colors['white/25']).toBe('rgba(255,255,255,0.25)');
  });

  it('resolves a mode-aware hex color to a live CSS variable reference, not a fixed hex', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    expect(colors.surface).toBe('rgb(var(--kb-color-surface))');
  });

  it('injects the backing :root/dark variable pair for that mode-aware color', async () => {
    const { useColors } = await import('./useColors');
    render(() => useColors());
    const css = document.getElementById('kbach-colors')!.textContent!;
    expect(css).toContain('--kb-color-surface: 249,250,251;');
    expect(css).toContain('--kb-color-surface: 17,24,39;');
  });

  it('alpha() wraps a mode-aware var() reference as an rgba(var(...)) call', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    expect(colors.alpha(colors.surface as string, 50)).toBe('rgba(var(--kb-color-surface), 0.5)');
  });

  it('alpha() handles hex, rgb(), and rgba() passthrough same as old-kbach', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    expect(colors.alpha('#000000', 50)).toBe('rgba(0,0,0,0.5)');
    expect(colors.alpha('rgb(0,0,0)', 50)).toBe('rgba(0,0,0,0.5)');
    expect(colors.alpha('rgba(0,0,0,0.2)', 50)).toBe('rgba(0,0,0,0.5)');
    expect(colors.alpha('#000000')).toBe('#000000');
  });

  it('a shade-family entry stays static across modes unless the user defines it as { light, dark }', async () => {
    const { setGlobalThemeMode } = await import('./darkModeStore');
    setGlobalThemeMode('dark');
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    // "blue-6" is a plain string in this test's theme — no automatic
    // shade-shifting happens just because dark mode is active.
    expect(colors.blue[6]).toBe('#2563eb');
  });

  it('a shade-family entry defined as { light, dark } resolves via the same CSS-variable mechanism as a flat name', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    expect(colors.blue[9]).toBe('rgb(var(--kb-color-blue-9))');
    const css = document.getElementById('kbach-colors')!.textContent!;
    expect(css).toContain('--kb-color-blue-9: 30,58,138;');
    expect(css).toContain('--kb-color-blue-9: 147,197,253;');
  });

  it('returns undefined for a shade/name that does not exist', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    // Unmatched top-level keys are treated as a possible shade-family name
    // (there's no way to distinguish "blue" the family from a typo without
    // that assumption, given this engine's flat "blue-6" keying) — actual
    // shade access on one that isn't real correctly comes back undefined.
    expect(colors.doesNotExist[0]).toBeUndefined();
    expect(colors.blue[99]).toBeUndefined();
  });

  it('get() returns the same value as dot access, typed as a plain string', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    const white: string = colors.get('white'); // no TS cast needed — this is the point
    expect(white).toBe(colors.white);
  });

  it('get() falls back to the name itself, unresolved, for an unknown color', async () => {
    const { useColors } = await import('./useColors');
    const colors = render(() => useColors());
    expect(colors.get('red')).toBe('red');
  });
});
