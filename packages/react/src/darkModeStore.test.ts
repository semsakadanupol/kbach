import { describe, it, expect, beforeEach, vi } from 'vitest';

// jsdom doesn't implement matchMedia at all — every test needs a working
// mock before importing the store (module-level code reads it at import
// time), even tests that don't care about "system" mode specifically.
function mockMatchMedia(prefersDark: boolean): { changeListeners: Set<(e: { matches: boolean }) => void> } {
  const changeListeners = new Set<(e: { matches: boolean }) => void>();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => changeListeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => changeListeners.delete(cb),
  })) as unknown as typeof window.matchMedia;
  return { changeListeners };
}

async function freshStore() {
  vi.resetModules();
  return import('./darkModeStore');
}

describe('darkModeStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.style.removeProperty('--kb-dark-mode');
  });

  it('defaults to the system preference when nothing is persisted', async () => {
    mockMatchMedia(true);
    const { getGlobalDarkMode, getGlobalThemeMode } = await freshStore();
    expect(getGlobalThemeMode()).toBe('system');
    expect(getGlobalDarkMode()).toBe(true);
  });

  it('applies the resolved dark state to documentElement via data-theme (the "attribute" strategy)', async () => {
    mockMatchMedia(true);
    vi.doMock('./theme', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./theme')>();
      return { ...actual, getTheme: () => ({ ...actual.defaultTheme, darkMode: 'attribute' }) };
    });
    await freshStore();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    vi.doUnmock('./theme');
  });

  it('setGlobalThemeMode persists the explicit choice and re-applies the DOM (the "attribute" strategy)', async () => {
    mockMatchMedia(false);
    vi.doMock('./theme', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./theme')>();
      return { ...actual, getTheme: () => ({ ...actual.defaultTheme, darkMode: 'attribute' }) };
    });
    const { setGlobalThemeMode } = await freshStore();
    setGlobalThemeMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('kbach-theme')).toBe('dark');
    vi.doUnmock('./theme');
  });

  it('a fresh module import picks up a previously persisted explicit choice over the system preference', async () => {
    mockMatchMedia(true); // system says dark
    window.localStorage.setItem('kbach-theme', 'light'); // but the user explicitly chose light
    const { getGlobalThemeMode, getGlobalDarkMode } = await freshStore();
    expect(getGlobalThemeMode()).toBe('light');
    expect(getGlobalDarkMode()).toBe(false);
  });

  it('toggleGlobalDarkMode flips light<->dark and always lands on an explicit mode', async () => {
    mockMatchMedia(false);
    const { toggleGlobalDarkMode, getGlobalDarkMode, getGlobalThemeMode } = await freshStore();
    expect(getGlobalDarkMode()).toBe(false);
    toggleGlobalDarkMode();
    expect(getGlobalDarkMode()).toBe(true);
    expect(getGlobalThemeMode()).toBe('dark');
    toggleGlobalDarkMode();
    expect(getGlobalDarkMode()).toBe(false);
    expect(getGlobalThemeMode()).toBe('light');
  });

  it('subscribeGlobalDarkMode notifies listeners on every explicit mode change, and unsubscribe stops notifications', async () => {
    mockMatchMedia(false);
    const { setGlobalThemeMode, subscribeGlobalDarkMode } = await freshStore();
    const listener = vi.fn();
    const unsubscribe = subscribeGlobalDarkMode(listener);
    setGlobalThemeMode('dark');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setGlobalThemeMode('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reacts live to a system-preference change while mode is "system", but not once an explicit choice is made', async () => {
    const { changeListeners } = mockMatchMedia(false);
    const { getGlobalDarkMode, subscribeGlobalDarkMode, setGlobalThemeMode } = await freshStore();
    const listener = vi.fn();
    subscribeGlobalDarkMode(listener);

    expect(getGlobalDarkMode()).toBe(false);
    for (const cb of changeListeners) cb({ matches: true });
    expect(getGlobalDarkMode()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setGlobalThemeMode('light'); // explicit choice — no longer "system"
    listener.mockClear();
    for (const cb of changeListeners) cb({ matches: true });
    expect(getGlobalDarkMode()).toBe(false); // unaffected — mode is no longer "system"
    expect(listener).not.toHaveBeenCalled();
  });

  it('uses the "class" strategy (toggling .dark/.light) when the active theme says so, instead of the data-theme attribute', async () => {
    mockMatchMedia(false);
    vi.doMock('./theme', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./theme')>();
      return { ...actual, getTheme: () => ({ ...actual.defaultTheme, darkMode: 'class' }) };
    });
    const { setGlobalThemeMode } = await freshStore();
    setGlobalThemeMode('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    vi.doUnmock('./theme');
  });

  it('seedDefaultMode applies the fallback only when nothing was persisted, and never persists it as a real choice', async () => {
    mockMatchMedia(false);
    const { seedDefaultMode, getGlobalThemeMode, getGlobalDarkMode } = await freshStore();
    seedDefaultMode('dark');
    expect(getGlobalThemeMode()).toBe('dark');
    expect(getGlobalDarkMode()).toBe(true);
    expect(window.localStorage.getItem('kbach-theme')).toBeNull();
  });

  it('seedDefaultMode is a no-op when the user already has a persisted explicit choice', async () => {
    mockMatchMedia(false);
    window.localStorage.setItem('kbach-theme', 'light');
    const { seedDefaultMode, getGlobalThemeMode } = await freshStore();
    seedDefaultMode('dark');
    expect(getGlobalThemeMode()).toBe('light'); // untouched — the user's own choice wins
  });

  describe('auto-detecting the darkMode strategy from --kb-dark-mode (no applyKbachConfig() call)', () => {
    it('reads a static-plugin-embedded "attribute" strategy and applies it to the very first DOM write, with NO explicit config call', async () => {
      mockMatchMedia(true); // system dark
      document.documentElement.style.setProperty('--kb-dark-mode', 'attribute');
      // No vi.doMock('./theme', ...) override here, unlike the other
      // strategy-specific tests above — this proves the DEFAULT theme's own
      // darkMode field gets updated purely by reading the CSS custom
      // property kbach.css embeds, not by an explicit setTheme()/
      // applyKbachConfig() call anywhere in this test.
      await freshStore();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('reads a static-plugin-embedded "class" strategy too', async () => {
      mockMatchMedia(true);
      document.documentElement.style.setProperty('--kb-dark-mode', 'class');
      await freshStore();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('is a no-op when --kb-dark-mode is not present at all (no static plugin, or a pre-marker build) — same default as before', async () => {
      mockMatchMedia(true);
      await freshStore();
      expect(document.documentElement.getAttribute('data-theme')).toBeNull(); // still 'media' default, no DOM write
    });

    it('ignores an unrecognized --kb-dark-mode value defensively, rather than applying it', async () => {
      mockMatchMedia(true);
      document.documentElement.style.setProperty('--kb-dark-mode', 'not-a-real-strategy');
      await freshStore();
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });

    it('an explicit applyKbachConfig() call still wins over the auto-detected value', async () => {
      mockMatchMedia(false);
      document.documentElement.style.setProperty('--kb-dark-mode', 'attribute');
      const { setGlobalThemeMode } = await freshStore();
      const { applyKbachConfig } = await import('./config');
      // Auto-detected 'attribute' already applied at import time; an
      // explicit later call switching to 'class' must still take effect.
      applyKbachConfig({ darkMode: 'class' });
      setGlobalThemeMode('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    });
  });
});
