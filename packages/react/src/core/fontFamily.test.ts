import { describe, it, expect, afterEach, vi } from 'vitest';

// isNative/getDefaultFontFamily depend on module-load-time state, so each
// case resets modules and re-imports fresh under simulated native globals —
// same technique as platform.test.ts.

function setNativeGlobals() {
  (globalThis as any).HermesInternal = {};
  (globalThis as any).navigator = { product: 'ReactNative' };
}
function clearNativeGlobals() {
  delete (globalThis as any).HermesInternal;
  delete (globalThis as any).navigator;
}

afterEach(() => {
  clearNativeGlobals();
  vi.resetModules();
});

// Regression coverage for a real bug: setDefaultFontFamily() feeds ONLY
// flatten()'s native-only default-font injection (web's equivalent comes
// from injectGlobalStyles()'s own `body { font-family: … }` CSS rule, built
// from theme.fontFamily.sans directly and unrelated to this). A sans value
// is commonly written as a CSS-style fallback list ('Tsukimi, sans-serif') —
// valid for that CSS rule, but invalid as a native fontFamily, which must be
// a single, exact, registered font name. Left unstripped, this landed on
// EVERY element flatten() touched (Views included, not just Text) with a
// value that could never match a real registered font.
describe('native default font family — strips CSS-style fallback lists', () => {
  it('strips a comma-separated fallback list to just the first font name', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { isNative } = await import('./platform');
    expect(isNative).toBe(true);

    const { buildConfig } = await import('./config');
    const { getDefaultFontFamily } = await import('./resolver');

    buildConfig({ extend: { theme: { fontFamily: { sans: 'Tsukimi, sans-serif' } } } } as any);
    expect(getDefaultFontFamily()).toBe('Tsukimi');
  });

  it('strips surrounding quotes from a quoted font name', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { buildConfig } = await import('./config');
    const { getDefaultFontFamily } = await import('./resolver');

    buildConfig({ extend: { theme: { fontFamily: { sans: '"Tsukimi", sans-serif' } } } } as any);
    expect(getDefaultFontFamily()).toBe('Tsukimi');
  });

  it('leaves a plain single font name untouched', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { buildConfig } = await import('./config');
    const { getDefaultFontFamily } = await import('./resolver');

    buildConfig({ extend: { theme: { fontFamily: { sans: 'Tsukimi' } } } } as any);
    expect(getDefaultFontFamily()).toBe('Tsukimi');
  });

  it('treats the RN-only "System" placeholder as no default font', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { buildConfig } = await import('./config');
    const { getDefaultFontFamily } = await import('./resolver');

    buildConfig({ extend: { theme: { fontFamily: { sans: 'System' } } } } as any);
    expect(getDefaultFontFamily()).toBeUndefined();
  });

  it('applies the stripped font via flatten() on a plain View-style resolve, not just Text', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { resolve, flatten } = await import('./resolver');
    const { buildConfig } = await import('./config');

    const config = buildConfig({
      extend: { theme: { fontFamily: { sans: 'Tsukimi, sans-serif' } } },
    } as any);
    const resolved = resolve('w-12 h-12 rounded-full', config.theme, config.darkMode);
    const flat = flatten(resolved, false, {}, new Set()) as any;

    expect(flat.width).toBe(48);
    expect(flat.height).toBe(48);
    expect(flat.fontFamily).toBe('Tsukimi');
  });
});
