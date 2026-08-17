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

describe('useGlobalDarkMode', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetModules();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('reflects the current global dark state, with no <ThemeProvider> mounted anywhere', async () => {
    mockMatchMedia(false);
    const { useGlobalDarkMode } = await import('./useGlobalDarkMode');

    let rendered: boolean | undefined;
    function Probe() {
      rendered = useGlobalDarkMode();
      return null;
    }

    root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(rendered).toBe(false);
  });

  it('re-renders the consumer when toggleGlobalDarkMode() is called elsewhere, entirely outside React', async () => {
    mockMatchMedia(false);
    const { useGlobalDarkMode } = await import('./useGlobalDarkMode');
    const { toggleGlobalDarkMode } = await import('./darkModeStore');

    let rendered: boolean | undefined;
    function Probe() {
      rendered = useGlobalDarkMode();
      return null;
    }

    root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(rendered).toBe(false);

    act(() => toggleGlobalDarkMode());
    expect(rendered).toBe(true);
  });
});
