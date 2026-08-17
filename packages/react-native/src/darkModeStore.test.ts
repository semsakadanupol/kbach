import { describe, it, expect, beforeEach, vi } from 'vitest';

function mockAppearance(prefersDark: boolean): { emitChange: (scheme: 'light' | 'dark') => void } {
  let listener: ((event: { colorScheme: 'light' | 'dark' | null }) => void) | null = null;
  const mockGetColorScheme = vi.fn(() => (prefersDark ? 'dark' : 'light') as 'light' | 'dark');
  const mockAddChangeListener = vi.fn((cb: (event: { colorScheme: 'light' | 'dark' | null }) => void) => {
    listener = cb;
    return { remove: vi.fn() };
  });
  vi.doMock('react-native', () => ({
    Appearance: { getColorScheme: mockGetColorScheme, addChangeListener: mockAddChangeListener },
  }));
  return {
    emitChange: (scheme) => listener?.({ colorScheme: scheme }),
  };
}

async function freshStore() {
  vi.resetModules();
  return import('./darkModeStore');
}

describe('darkModeStore (react-native)', () => {
  beforeEach(() => {
    vi.doUnmock('react-native');
  });

  it('defaults to the system preference (no persistence to check, unlike the web store)', async () => {
    mockAppearance(true);
    const { getGlobalDarkMode, getGlobalThemeMode } = await freshStore();
    expect(getGlobalThemeMode()).toBe('system');
    expect(getGlobalDarkMode()).toBe(true);
  });

  it('toggleGlobalDarkMode flips light<->dark and always lands on an explicit mode', async () => {
    mockAppearance(false);
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
    mockAppearance(false);
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
    const { emitChange } = mockAppearance(false);
    const { getGlobalDarkMode, subscribeGlobalDarkMode, setGlobalThemeMode } = await freshStore();
    const listener = vi.fn();
    subscribeGlobalDarkMode(listener);

    expect(getGlobalDarkMode()).toBe(false);
    emitChange('dark');
    expect(getGlobalDarkMode()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setGlobalThemeMode('light'); // explicit choice — no longer "system"
    listener.mockClear();
    emitChange('dark');
    expect(getGlobalDarkMode()).toBe(false); // unaffected — mode is no longer "system"
    expect(listener).not.toHaveBeenCalled();
  });

  it('seedDefaultMode applies the fallback only when nothing has made an explicit choice yet', async () => {
    mockAppearance(false);
    const { seedDefaultMode, getGlobalThemeMode, getGlobalDarkMode } = await freshStore();
    seedDefaultMode('dark');
    expect(getGlobalThemeMode()).toBe('dark');
    expect(getGlobalDarkMode()).toBe(true);
  });

  it('seedDefaultMode is a no-op once an explicit choice has already been made', async () => {
    mockAppearance(false);
    const { setGlobalThemeMode, seedDefaultMode, getGlobalThemeMode } = await freshStore();
    setGlobalThemeMode('light');
    seedDefaultMode('dark');
    expect(getGlobalThemeMode()).toBe('light'); // untouched — the explicit choice wins
  });

  it('an explicit setGlobalThemeMode call before seeding blocks a later seedDefaultMode, even to the same value as the OS default', async () => {
    mockAppearance(false);
    const { setGlobalThemeMode, seedDefaultMode, getGlobalThemeMode } = await freshStore();
    setGlobalThemeMode('system');
    seedDefaultMode('dark');
    expect(getGlobalThemeMode()).toBe('system'); // the explicit choice (even "system") still wins
  });
});
