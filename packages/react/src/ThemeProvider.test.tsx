import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

function mockMatchMedia(prefersDark: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('ThemeProvider + useTheme', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('useTheme() throws when called outside any <ThemeProvider>', async () => {
    const { useTheme } = await import('./ThemeContext');

    function Probe() {
      useTheme();
      return null;
    }

    // React logs its own error boundary console.error for a thrown render —
    // silence it for this one expected-to-throw case only.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    root = createRoot(container);
    expect(() => act(() => root.render(<Probe />))).toThrow(/must be called within a <ThemeProvider>/);
    spy.mockRestore();
  });

  it('provides mode/isDark/setMode/toggle to descendants', async () => {
    mockMatchMedia(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./ThemeContext');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    root = createRoot(container);
    act(() => {
      root.render(
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

  it('defaultMode seeds the store on mount when nothing is persisted', async () => {
    mockMatchMedia(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./ThemeContext');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    root = createRoot(container);
    act(() => {
      root.render(
        <ThemeProvider defaultMode="dark">
          <Probe />
        </ThemeProvider>,
      );
    });

    expect(captured!.mode).toBe('dark');
    expect(captured!.isDark).toBe(true);
  });

  it('an explicit persisted user choice wins over defaultMode', async () => {
    mockMatchMedia(false);
    window.localStorage.setItem('kbach-theme', 'light');
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./ThemeContext');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    root = createRoot(container);
    act(() => {
      root.render(
        <ThemeProvider defaultMode="dark">
          <Probe />
        </ThemeProvider>,
      );
    });

    expect(captured!.mode).toBe('light');
  });

  it('stays in sync with useGlobalDarkMode()/toggleGlobalDarkMode() called with no provider involved', async () => {
    mockMatchMedia(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./ThemeContext');
    const { toggleGlobalDarkMode } = await import('./darkModeStore');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    root = createRoot(container);
    act(() => {
      root.render(
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
    mockMatchMedia(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    root = createRoot(container);
    act(() => {
      root.render(
        <>
          <ThemeProvider>
            <div />
          </ThemeProvider>
          <ThemeProvider>
            <div />
          </ThemeProvider>
        </>,
      );
    });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Multiple <ThemeProvider> instances'));
    spy.mockRestore();
  });
});
