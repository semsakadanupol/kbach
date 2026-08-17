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
