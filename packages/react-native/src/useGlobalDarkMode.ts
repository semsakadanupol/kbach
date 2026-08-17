import { useSyncExternalStore } from 'react';
import { getGlobalDarkMode, subscribeGlobalDarkMode } from './darkModeStore';

/**
 * Reactive read of the global dark-mode store — works with or without a
 * `<ThemeProvider>` mounted anywhere in the tree, since it subscribes to
 * `darkModeStore.ts` directly. No server-snapshot argument (unlike
 * @kbach/react's web version) — React Native has no SSR concept at all,
 * so there's no third argument for `useSyncExternalStore` to need.
 */
export function useGlobalDarkMode(): boolean {
  return useSyncExternalStore(subscribeGlobalDarkMode, getGlobalDarkMode);
}
