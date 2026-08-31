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

describe('useTheme + ThemeProvider', () => {
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

  it('useTheme() works with no <ThemeProvider> mounted anywhere', async () => {
    mockMatchMedia(false);
    const { useTheme } = await import('./useTheme');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    root = createRoot(container);
    act(() => root.render(<Probe />));

    expect(captured!.mode).toBe('system');
    expect(captured!.isDark).toBe(false);

    act(() => captured!.toggle());
    expect(captured!.isDark).toBe(true);
    expect(captured!.mode).toBe('dark');
  });

  it('re-renders a standalone useTheme() consumer when the store changes from entirely outside React', async () => {
    mockMatchMedia(false);
    const { useTheme } = await import('./useTheme');
    const { toggleGlobalDarkMode } = await import('./darkModeStore');

    let captured: ReturnType<typeof useTheme> | undefined;
    function Probe() {
      captured = useTheme();
      return null;
    }

    root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(captured!.isDark).toBe(false);

    act(() => toggleGlobalDarkMode());
    expect(captured!.isDark).toBe(true);
  });

  it('provides mode/isDark/setMode/toggle to descendants, with a <ThemeProvider> mounted too', async () => {
    mockMatchMedia(false);
    const { ThemeProvider } = await import('./ThemeProvider');
    const { useTheme } = await import('./useTheme');

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
    const { useTheme } = await import('./useTheme');

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
    const { useTheme } = await import('./useTheme');

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

    // Called with a %c-styled first argument plus its CSS strings — assert
    // the message text itself, not the exact call arity.
    expect(spy.mock.calls[0]![0]).toEqual(expect.stringContaining('Multiple <ThemeProvider> instances'));
    spy.mockRestore();
  });
});
