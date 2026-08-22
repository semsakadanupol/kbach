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

// Flushes every pending microtask, regardless of how many `.then()` hops
// deep — `persist.getItem(...).then(...)` inside ThemeProvider's effect is
// exactly that kind of chain, and a fixed number of `await Promise.resolve()`
// calls would be a fragile guess at its depth.
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((key: string) => Promise.resolve(key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    store,
  };
}

describe('useTheme + ThemeProvider (react-native)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('react-native');
  });

  it('useTheme() works with no <ThemeProvider> mounted anywhere', async () => {
    mockAppearance(false);
    const { useTheme } = await import('./useTheme');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    act(() => TestRenderer.create(<Probe />));

    expect(captured!.mode).toBe('system');
    expect(captured!.isDark).toBe(false);

    act(() => captured!.toggle());
    expect(captured!.isDark).toBe(true);
    expect(captured!.mode).toBe('dark');
  });

  it('re-renders a standalone useTheme() consumer when the store changes from entirely outside React', async () => {
    mockAppearance(false);
    const { useTheme } = await import('./useTheme');
    const { toggleGlobalDarkMode } = await import('./darkModeStore');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    act(() => TestRenderer.create(<Probe />));
    expect(captured!.isDark).toBe(false);

    act(() => toggleGlobalDarkMode());
    expect(captured!.isDark).toBe(true);
  });

  it('provides mode/isDark/setMode/toggle to descendants, with a <ThemeProvider> mounted too', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    act(() => {
      TestRenderer.create(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );
    });

    expect(captured!.mode).toBe('system');
    expect(captured!.isDark).toBe(false);

    act(() => captured!.toggle());
    expect(captured!.isDark).toBe(true);
    expect(captured!.mode).toBe('dark');
  });

  it('defaultMode seeds the store on mount when nothing has made an explicit choice yet', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    act(() => {
      TestRenderer.create(
        <ThemeProvider defaultMode="dark">
          <Probe />
        </ThemeProvider>,
      );
    });

    expect(captured!.mode).toBe('dark');
    expect(captured!.isDark).toBe(true);
  });

  it('an explicit setGlobalThemeMode call before mount wins over defaultMode', async () => {
    mockAppearance(false);
    const { setGlobalThemeMode } = await import('./darkModeStore');
    setGlobalThemeMode('light');
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    act(() => {
      TestRenderer.create(
        <ThemeProvider defaultMode="dark">
          <Probe />
        </ThemeProvider>,
      );
    });

    expect(captured!.mode).toBe('light');
  });

  it('persist reads a stored mode on mount, and it wins over defaultMode', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');
    const storage = fakeStorage({ 'kbach-theme': 'dark' });

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    await act(async () => {
      TestRenderer.create(
        <ThemeProvider persist={storage} defaultMode="light">
          <Probe />
        </ThemeProvider>,
      );
      await flushMicrotasks();
    });

    expect(storage.getItem).toHaveBeenCalledWith('kbach-theme');
    expect(captured!.mode).toBe('dark');
  });

  it('persist falls back to defaultMode when nothing is stored yet', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');
    const storage = fakeStorage(); // empty — nothing persisted yet

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    await act(async () => {
      TestRenderer.create(
        <ThemeProvider persist={storage} defaultMode="dark">
          <Probe />
        </ThemeProvider>,
      );
      await flushMicrotasks();
    });

    expect(captured!.mode).toBe('dark');
  });

  it('persist writes every later explicit mode change back to storage', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');
    const storage = fakeStorage();

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    await act(async () => {
      TestRenderer.create(
        <ThemeProvider persist={storage}>
          <Probe />
        </ThemeProvider>,
      );
      await flushMicrotasks();
    });

    act(() => captured!.setMode('dark'));
    expect(storage.setItem).toHaveBeenCalledWith('kbach-theme', 'dark');
    expect(storage.store['kbach-theme']).toBe('dark');
  });

  it('an explicit setGlobalThemeMode call before mount still wins over a persisted value (same guard as defaultMode)', async () => {
    mockAppearance(false);
    const { setGlobalThemeMode } = await import('./darkModeStore');
    setGlobalThemeMode('light');
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');
    const storage = fakeStorage({ 'kbach-theme': 'dark' });

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    await act(async () => {
      TestRenderer.create(
        <ThemeProvider persist={storage}>
          <Probe />
        </ThemeProvider>,
      );
      await flushMicrotasks();
    });

    expect(captured!.mode).toBe('light');
  });

  it('persist is false by default — no storage calls happen without opting in', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const storage = fakeStorage();

    await act(async () => {
      TestRenderer.create(
        <ThemeProvider>
          <></>
        </ThemeProvider>,
      );
      await flushMicrotasks();
    });

    expect(storage.getItem).not.toHaveBeenCalled();
  });

  it('a storage read failure falls back to defaultMode instead of throwing', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');
    const storage = {
      getItem: vi.fn(() => Promise.reject(new Error('storage unavailable'))),
      setItem: vi.fn(() => Promise.resolve()),
    };

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    await act(async () => {
      TestRenderer.create(
        <ThemeProvider persist={storage} defaultMode="dark">
          <Probe />
        </ThemeProvider>,
      );
      await flushMicrotasks();
    });

    expect(captured!.mode).toBe('dark');
  });

  it('warns when more than one <ThemeProvider> is mounted at once', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    act(() => {
      TestRenderer.create(
        <>
          <ThemeProvider>
            <></>
          </ThemeProvider>
          <ThemeProvider>
            <></>
          </ThemeProvider>
        </>,
      );
    });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Multiple <ThemeProvider> instances'));
    spy.mockRestore();
  });
});
