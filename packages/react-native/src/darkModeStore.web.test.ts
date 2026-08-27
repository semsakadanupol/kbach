// @vitest-environment jsdom
// Regression guard for the bug this file's own applyToDom fix addresses:
// darkModeStore.ts is shared by real native AND Expo Web (no `.web.ts`
// sibling), and only the Expo Web path renders into a real DOM that
// nativeBridge.web.ts's generated `[data-theme="dark"]`-style CSS needs
// something to actually write. Every other darkModeStore test file runs in
// the package's default 'node' environment (no `document` at all), which
// only ever proves the no-op-on-native half of applyToDom's guard — this
// file opts into jsdom (mirroring nativeBridge.web.test.ts's own pattern)
// specifically to prove the DOM-writing half actually works.
import { describe, it, expect, beforeEach, vi } from 'vitest';

function mockAppearance(prefersDark: boolean): void {
  vi.doMock('react-native', () => ({
    Appearance: {
      getColorScheme: () => (prefersDark ? 'dark' : 'light'),
      addChangeListener: () => ({ remove: vi.fn() }),
    },
  }));
}

// Mirrors darkModeStore.test.ts's own identical helper — `emitChange` is a
// closure returned from here, not called in the same scope as `let
// listener`'s declaration, which is what keeps TS from narrowing it to
// `null`-only across the addChangeListener callback's own reassignment.
function mockAppearanceWithChangeListener(prefersDark: boolean): { emitChange: (scheme: 'light' | 'dark') => void } {
  let listener: ((event: { colorScheme: 'light' | 'dark' | null }) => void) | null = null;
  vi.doMock('react-native', () => ({
    Appearance: {
      getColorScheme: () => (prefersDark ? 'dark' : 'light'),
      addChangeListener: (cb: (event: { colorScheme: 'light' | 'dark' | null }) => void) => {
        listener = cb;
        return { remove: vi.fn() };
      },
    },
  }));
  return {
    emitChange: (scheme) => listener?.({ colorScheme: scheme }),
  };
}

async function freshStore() {
  vi.resetModules();
  return import('./darkModeStore');
}

// `vi.resetModules()` gives every test a fresh `./theme` instance too — a
// `setTheme()` call must happen against the SAME reset epoch `darkModeStore`
// will import from, or it writes to an instance that's already been
// discarded by the time `darkModeStore` re-imports `./theme` itself (see
// useColors.test.tsx's identical fix elsewhere in this package for the
// same underlying pitfall). Resets ONCE and returns both modules from that
// one epoch, rather than calling freshStore()/a separate theme import
// independently.
async function freshStoreWithTheme(darkMode: import('./theme').ThemeConfig['darkMode']) {
  vi.resetModules();
  const { setTheme, defaultTheme } = await import('./theme');
  setTheme({ ...defaultTheme, darkMode });
  const store = await import('./darkModeStore');
  return { ...store, resetTheme: () => setTheme(defaultTheme) };
}

describe('darkModeStore applyToDom (react-native, Expo Web)', () => {
  beforeEach(() => {
    vi.doUnmock('react-native');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark', 'light');
  });

  it('writes data-theme on module load, matching the default "attribute" strategy', async () => {
    mockAppearance(true);
    await freshStore();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('updates data-theme when setGlobalThemeMode is called — this is the toggle() bug itself', async () => {
    mockAppearance(false);
    const { setGlobalThemeMode } = await freshStore();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    setGlobalThemeMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggleGlobalDarkMode updates the DOM too, not just the in-memory state', async () => {
    mockAppearance(false);
    const { toggleGlobalDarkMode, getGlobalDarkMode } = await freshStore();
    toggleGlobalDarkMode();
    expect(getGlobalDarkMode()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('seedDefaultMode writes the DOM too', async () => {
    mockAppearance(false);
    const { seedDefaultMode } = await freshStore();
    seedDefaultMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('a live system-preference change updates the DOM too, while mode is "system"', async () => {
    const { emitChange } = mockAppearanceWithChangeListener(false);
    await freshStore();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    emitChange('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('honors the "class" darkMode strategy instead of the attribute default', async () => {
    mockAppearance(false);
    const { setGlobalThemeMode, resetTheme } = await freshStoreWithTheme('class');
    setGlobalThemeMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    resetTheme();
  });

  it('the "media" strategy writes nothing to the DOM at all — the generated @media query tracks the OS directly', async () => {
    mockAppearance(false);
    const { setGlobalThemeMode, getGlobalDarkMode, resetTheme } = await freshStoreWithTheme('media');
    setGlobalThemeMode('dark');
    expect(getGlobalDarkMode()).toBe(true); // still accurate for JS consumers
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    resetTheme();
  });

  it('applyKbachConfig() (config.ts) re-syncs the DOM immediately when switching strategy — reproduces a real "system theme not detected" bug found via a headless-browser check', async () => {
    // System prefers dark, and this is a genuinely cold module graph (like a
    // real app's first load): darkModeStore.ts's own module-load-time
    // applyToDom() call runs against whatever getTheme().darkMode is AT THAT
    // MOMENT — the default theme's 'media' strategy, a harmless no-op — since
    // it necessarily finishes evaluating before an app's own top-level
    // applyKbachConfig({darkMode: 'attribute'}) call gets a chance to run.
    mockAppearance(true);
    vi.resetModules();
    const { applyKbachConfig } = await import('./config');
    // Without resyncDomWithActiveTheme() inside applyKbachConfig, this would
    // still read null here — isDark was already true, but nothing had ever
    // written it to the DOM under the new strategy, and setTheme() alone has
    // no DOM side effect. Confirmed via a real Playwright check against
    // apps/web-sandbox: useTheme().isDark read true while <html data-theme>
    // stayed unset, so `dark:` classes silently never applied on load.
    applyKbachConfig({ darkMode: 'attribute' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
