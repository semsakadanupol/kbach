import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { ThemeContext, type ThemeContextValue } from './ThemeContext';
import {
  getGlobalDarkMode,
  getGlobalThemeMode,
  seedDefaultMode,
  setGlobalThemeMode,
  subscribeGlobalDarkMode,
  toggleGlobalDarkMode,
  type ThemeMode,
} from './darkModeStore';

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Applied once, on this provider's first mount, but ONLY if nothing has
   * made an explicit mode choice yet (see
   * `darkModeStore.ts::seedDefaultMode`) — an explicit prior choice always
   * wins over a component's own default. Unlike @kbach/react's web
   * version, there's no persisted value to check here — see
   * darkModeStore.ts's own doc comment on why this package doesn't persist
   * the mode across app launches.
   */
  defaultMode?: ThemeMode;
}

let mountedProviderCount = 0;
let warnedMultipleProviders = false;

/**
 * Native port of @kbach/react's `ThemeProvider` — a thin, OPTIONAL React
 * Context wrapper around `darkModeStore.ts`'s single global store, not the
 * source of truth itself. Because the store is global, MULTIPLE mounted
 * providers share the exact same `mode`/`isDark` state rather than each
 * getting their own scoped value — mounting more than one is very likely a
 * mistake (each fighting over the same state via a different
 * `defaultMode`), so this warns once in dev, matching the web version's
 * identical guard.
 */
export function ThemeProvider({ children, defaultMode = 'system' }: ThemeProviderProps) {
  useEffect(() => {
    mountedProviderCount++;
    if (mountedProviderCount > 1 && !warnedMultipleProviders) {
      warnedMultipleProviders = true;
      console.warn(
        '[kbach] Multiple <ThemeProvider> instances are mounted at once. ' +
          'Dark-mode state is one global store (the same one useGlobalDarkMode()/toggleGlobalDarkMode() read and write), not scoped per-provider, so they will fight over the same state instead of each getting their own.',
      );
    }
    return () => {
      mountedProviderCount--;
    };
  }, []);

  // Seed the store's default exactly once per provider instance — a
  // second effect run (e.g. React 18 Strict Mode's mount/unmount/remount
  // in dev) must not re-seed, since by then the user may have already
  // toggled the theme and a re-seed would stomp that back to the default.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    seedDefaultMode(defaultMode);
    // Deliberately NOT reactive to `defaultMode` changing after mount —
    // this is a one-time initial seed, not a controlled prop; a later
    // `defaultMode` change on a live provider shouldn't silently override
    // whatever the user has since chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDark = useSyncExternalStore(subscribeGlobalDarkMode, getGlobalDarkMode);
  const mode = useSyncExternalStore(subscribeGlobalDarkMode, getGlobalThemeMode);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, isDark, setMode: setGlobalThemeMode, toggle: toggleGlobalDarkMode }),
    [mode, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
