// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ThemeProvider, __resetForTests } from './ThemeProvider';
import { useTheme } from './context';

// Node 22+'s own experimental global `localStorage` (backed by a SQLite file
// that isn't configured here) shadows jsdom's Storage implementation and
// throws instead of behaving like a real Storage — replace it with a plain
// in-memory Storage so ThemeProvider's bare `localStorage` references (both
// in source and in these tests) hit a real, working implementation.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  key(i: number): string | null { return Array.from(this.store.keys())[i] ?? null; }
  get length(): number { return this.store.size; }
}
const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true, writable: true });
Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true, writable: true });

// jsdom does not implement matchMedia — stub it so getSystemScheme()/
// subscribeSystemScheme() take their documented "no support" fallback path
// (system scheme resolves to 'light', no live-preference-change wiring)
// instead of a real environment gap deciding the test's behavior.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  // applyWebTheme() never cleans up after itself on unmount (it only ever
  // sets, matching how the DOM attribute/class is meant to persist across
  // an app's lifetime) — tests must reset it themselves between cases.
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark', 'light');
  // ThemeProvider's warn-once flags and mount counters are module-level, not
  // per-instance — without this, a test order change could silently make a
  // warn-once assertion depend on which test ran first.
  __resetForTests();
});

function Probe() {
  const { mode, resolvedMode, isDark, toggle, setMode } = useTheme();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolvedMode">{resolvedMode}</span>
      <span data-testid="isDark">{String(isDark)}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={() => setMode('dark')}>set-dark</button>
      <button onClick={() => setMode('light')}>set-light</button>
    </div>
  );
}

describe('ThemeProvider — dark mode strategies', () => {
  it('"attribute" strategy sets/toggles [data-theme] on <html>, not a class', () => {
    const { getByText } = render(
      <ThemeProvider config={{ darkMode: 'attribute' }} defaultMode="light" disablePersistence>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fireEvent.click(getByText('toggle'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('"class" strategy toggles .dark/.light classes on <html>, not the attribute', () => {
    const { getByText } = render(
      <ThemeProvider config={{ darkMode: 'class' }} defaultMode="light" disablePersistence>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    fireEvent.click(getByText('toggle'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('"media" strategy never touches the DOM, even though context state still updates', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getByText, getByTestId } = render(
      <ThemeProvider config={{ darkMode: 'media' }} defaultMode="light" disablePersistence>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('light')).toBe(false);

    fireEvent.click(getByText('toggle'));
    // React state DID update (isDark/mode) — this is exactly the divergence
    // the dev warning exists to flag: state says dark, DOM says nothing.
    expect(getByTestId('isDark').textContent).toBe('true');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    warnSpy.mockRestore();
  });

  it('warns once (dev-only) when setMode()/toggle() is used under "media" strategy', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { getByText } = render(
      <ThemeProvider config={{ darkMode: 'media' }} defaultMode="light" disablePersistence>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(getByText('toggle'));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // kbachWarn() logs as console.warn('%c[kbach]%c ' + message, style1, style2) —
    // the actual message text is in args[0], after the %c placeholders.
    expect(String(warnSpy.mock.calls[0][0])).toContain('media');

    fireEvent.click(getByText('set-light'));
    fireEvent.click(getByText('set-dark'));
    // Still only the one warning — the module-level flag makes this warn-once, not warn-every-call.
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

describe('ThemeProvider — persistence', () => {
  it('persists setMode() to localStorage by default', () => {
    const { getByText } = render(
      <ThemeProvider config={{ darkMode: 'attribute' }} defaultMode="light">
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(getByText('set-dark'));
    expect(localStorage.getItem('kbach-theme')).toBe('dark');
  });

  it('does not write to localStorage when disablePersistence is set', () => {
    const { getByText } = render(
      <ThemeProvider config={{ darkMode: 'attribute' }} defaultMode="light" disablePersistence>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(getByText('set-dark'));
    expect(localStorage.getItem('kbach-theme')).toBeNull();
  });

  it('picks up a persisted mode after mount, overriding defaultMode', async () => {
    localStorage.setItem('kbach-theme', 'dark');
    const { findByTestId } = render(
      <ThemeProvider config={{ darkMode: 'attribute' }} defaultMode="light">
        <Probe />
      </ThemeProvider>,
    );
    // The persisted-mode read happens in a post-mount effect (see ThemeProvider.tsx),
    // so this only becomes true after that effect flushes.
    const modeEl = await findByTestId('mode');
    expect(modeEl.textContent).toBe('dark');
  });
});

function ColorProbe() {
  const { config } = useTheme();
  const blue6 = (config.theme.colors.blue as Record<string, string> | undefined)?.['6'];
  return <span data-testid="blue6">{blue6}</span>;
}

describe('ThemeProvider — config override cleanup', () => {
  // Regression: updateConfig(configOverride) writes into a process-wide
  // singleton with nothing reverting it on unmount — a later <ThemeProvider>
  // with no override of its own used to silently inherit whatever config an
  // earlier, already-unmounted overriding provider left behind.
  it('reverts the global config after an overriding provider unmounts and nothing else is mounted', () => {
    const first = render(
      <ThemeProvider config={{ extend: { theme: { colors: { blue: { 6: '#123456' } } } } }} disablePersistence>
        <ColorProbe />
      </ThemeProvider>,
    );
    expect(first.getByTestId('blue6').textContent).toBe('#123456');
    first.unmount();

    const second = render(
      <ThemeProvider disablePersistence>
        <ColorProbe />
      </ThemeProvider>,
    );
    // Must NOT still be the previous (now-unmounted) provider's overridden color.
    expect(second.getByTestId('blue6').textContent).not.toBe('#123456');
    second.unmount();
  });
});
