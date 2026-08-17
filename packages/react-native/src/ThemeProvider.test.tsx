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

describe('ThemeProvider + useTheme (react-native)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('react-native');
  });

  it('useTheme() throws when called outside any <ThemeProvider>', async () => {
    mockAppearance(false);
    const { useTheme } = await import('./ThemeContext');

    function Probe() {
      useTheme();
      return null;
    }

    // React logs its own error boundary console.error for a thrown render —
    // silence it for this one expected-to-throw case only.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => act(() => TestRenderer.create(<Probe />))).toThrow(/must be called within a <ThemeProvider>/);
    spy.mockRestore();
  });

  it('provides mode/isDark/setMode/toggle to descendants', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./ThemeContext');

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
    const { useTheme } = await import('./ThemeContext');

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
    const { useTheme } = await import('./ThemeContext');

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

  it('stays in sync with useGlobalDarkMode()/toggleGlobalDarkMode() called with no provider involved', async () => {
    mockAppearance(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./ThemeContext');
    const { toggleGlobalDarkMode } = await import('./darkModeStore');

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
    expect(captured!.isDark).toBe(false);

    // Toggled via the standalone function, not captured.toggle() — proves
    // the provider is just a view onto the same global store, not a
    // separate state machine.
    act(() => toggleGlobalDarkMode());
    expect(captured!.isDark).toBe(true);
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
