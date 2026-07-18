import { getGlobalDarkMode, subscribeGlobalDarkMode } from './core';
import { useSyncExternalStore } from './useSyncExternalStoreShim';

/**
 * Subscribe to the global dark-mode store with React's concurrent-safe
 * useSyncExternalStore so that any component using className/kb re-renders
 * immediately when the theme changes — without needing ThemeContext.
 */
export function useGlobalDarkMode(): boolean {
  return useSyncExternalStore(
    subscribeGlobalDarkMode,
    getGlobalDarkMode,
    () => false, // SSR: default light
  );
}
