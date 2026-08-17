import { useMemo, useSyncExternalStore } from 'react';
import {
  getGlobalDarkMode,
  getGlobalThemeMode,
  setGlobalThemeMode,
  subscribeGlobalDarkMode,
  toggleGlobalDarkMode,
  type ThemeMode,
} from './darkModeStore';

export interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

/**
 * The one hook for reading and writing Kbach's dark-mode state. Reads
 * `darkModeStore.ts`'s global store directly via `useSyncExternalStore` —
 * that module-level store, not React Context, is the actual source of
 * truth (every provider used to just mirror it into a Context value), so
 * this works from ANY component, with or without a `<ThemeProvider>`
 * mounted anywhere in the tree. `<ThemeProvider>` still exists, but purely
 * as an optional convenience for seeding an app's initial `defaultMode` —
 * see its own doc comment. No server-snapshot argument (unlike
 * @kbach/react's web version) — React Native has no SSR concept at all,
 * so there's no third argument for `useSyncExternalStore` to need.
 */
export function useTheme(): ThemeState {
  const isDark = useSyncExternalStore(subscribeGlobalDarkMode, getGlobalDarkMode);
  const mode = useSyncExternalStore(subscribeGlobalDarkMode, getGlobalThemeMode);
  return useMemo(
    () => ({ mode, isDark, setMode: setGlobalThemeMode, toggle: toggleGlobalDarkMode }),
    [mode, isDark],
  );
}
