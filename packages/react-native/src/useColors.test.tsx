import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';

function mockAppearance(prefersDark: boolean): void {
  vi.doMock('react-native', () => ({
    Appearance: {
      getColorScheme: () => (prefersDark ? 'dark' : 'light'),
      addChangeListener: () => ({ remove: vi.fn() }),
    },
  }));
}

function render<T>(use: () => T): T {
  let captured!: T;
  function Probe() {
    captured = use();
    return null;
  }
  act(() => TestRenderer.create(<Probe />));
  return captured;
}

// `vi.resetModules()` gives every test a FRESH `./theme` module instance,
// so `setTheme()` must be called against the SAME dynamically re-imported
// instance `useColors()` will read from — a statically-imported `setTheme`
// at this file's top would write to a stale, already-discarded instance.
async function setupTheme(colors: Record<string, import('./theme').ColorEntry>) {
  const { setTheme, defaultTheme } = await import('./theme');
  setTheme({ ...defaultTheme, colors });
  return import('./useColors');
}

describe('useColors (react-native)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('react-native');
  });

  it('resolves a shade-family lookup to the raw hex', async () => {
    mockAppearance(false);
    const { useColors } = await setupTheme({ 'blue-6': '#2563eb', 'blue-7': '#1e40af' });
    const colors = render(() => useColors());
    expect(colors.blue[6]).toBe('#2563eb');
  });

  it('a static shade-family entry stays the same across modes — no automatic shifting', async () => {
    mockAppearance(true);
    const { useColors } = await setupTheme({ 'blue-6': '#2563eb', 'blue-7': '#1e40af' });
    const colors = render(() => useColors());
    // Dark mode is active, but "blue-6" is a plain string in this theme —
    // it stays shade 6's value, not shade 7's.
    expect(colors.blue[6]).toBe('#2563eb');
  });

  it('a manually defined { light, dark } shade-family entry resolves per isDark', async () => {
    const entry = { light: '#2563eb', dark: '#93c5fd' };

    mockAppearance(false);
    const { useColors: lightColors } = await setupTheme({ 'blue-6': entry });
    expect(render(() => lightColors().blue[6])).toBe('#2563eb');

    vi.resetModules();
    mockAppearance(true);
    const { useColors: darkColors } = await setupTheme({ 'blue-6': entry });
    expect(render(() => darkColors().blue[6])).toBe('#93c5fd');
  });

  it('a manually defined { light, dark } flat name resolves per isDark', async () => {
    const entry = { light: '#f9fafb', dark: '#111827' };
    mockAppearance(true);
    const { useColors } = await setupTheme({ surface: entry });
    const colors = render(() => useColors());
    expect(colors.surface).toBe('#111827');
  });

  it('resolves a shade-family opacity lookup', async () => {
    mockAppearance(false);
    const { useColors } = await setupTheme({ 'blue-6': '#2563eb', 'blue-7': '#1e40af' });
    const colors = render(() => useColors());
    const blue = colors.blue as import('./useColors').ColorScale;
    expect(blue['6/50']).toBe('rgba(37,99,235,0.5)');
  });

  it('resolves a flat color and a flat opacity lookup', async () => {
    mockAppearance(false);
    const { useColors } = await setupTheme({ white: '#ffffff' });
    const colors = render(() => useColors());
    expect(colors.white).toBe('#ffffff');
    expect(colors['white/25']).toBe('rgba(255,255,255,0.25)');
  });

  it('alpha() applies opacity to any color string', async () => {
    mockAppearance(false);
    const { useColors } = await setupTheme({});
    const colors = render(() => useColors());
    expect(colors.alpha('#000000', 50)).toBe('rgba(0,0,0,0.5)');
    expect(colors.alpha('#000000')).toBe('#000000');
  });

  it('returns undefined for a shade/name that does not exist', async () => {
    mockAppearance(false);
    const { useColors } = await setupTheme({ 'blue-6': '#2563eb' });
    const colors = render(() => useColors());
    expect(colors.doesNotExist[0]).toBeUndefined();
    expect(colors.blue[99]).toBeUndefined();
  });

  it('get() returns the same value as dot access, typed as a plain string', async () => {
    mockAppearance(false);
    const { useColors } = await setupTheme({ brand: '#ff6b35' });
    const colors = render(() => useColors());
    const brand: string = colors.get('brand'); // no TS cast needed — this is the point
    expect(brand).toBe(colors.brand);
  });

  it('get() falls back to the name itself, unresolved, for an unknown color', async () => {
    mockAppearance(false);
    const { useColors } = await setupTheme({});
    const colors = render(() => useColors());
    expect(colors.get('red')).toBe('red');
  });
});
