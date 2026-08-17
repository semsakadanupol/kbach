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

describe('useGlobalDarkMode (react-native)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('react-native');
  });

  it('reflects the current global dark state, with no <ThemeProvider> mounted anywhere', async () => {
    mockAppearance(false);
    const { useGlobalDarkMode } = await import('./useGlobalDarkMode');

    let rendered: boolean | undefined;
    function Probe() {
      rendered = useGlobalDarkMode();
      return null;
    }

    act(() => {
      TestRenderer.create(<Probe />);
    });
    expect(rendered).toBe(false);
  });

  it('re-renders the consumer when toggleGlobalDarkMode() is called elsewhere, entirely outside React', async () => {
    mockAppearance(false);
    const { useGlobalDarkMode } = await import('./useGlobalDarkMode');
    const { toggleGlobalDarkMode } = await import('./darkModeStore');

    let rendered: boolean | undefined;
    function Probe() {
      rendered = useGlobalDarkMode();
      return null;
    }

    act(() => {
      TestRenderer.create(<Probe />);
    });
    expect(rendered).toBe(false);

    act(() => toggleGlobalDarkMode());
    expect(rendered).toBe(true);
  });
});
