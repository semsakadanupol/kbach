import { useSyncExternalStore } from 'react';
import { getGlobalDarkMode, subscribeGlobalDarkMode } from './darkModeStore';

const getServerSnapshot = () => false;

/**
 * Reactive read of the global dark-mode store — works with or without a
 * `<ThemeProvider>` mounted anywhere in the tree, since it subscribes to
 * `darkModeStore.ts` directly. `useSyncExternalStore`'s SSR snapshot always
 * returns `false` (light), matching `applyToDom`'s own server no-op — the
 * server and the client's very first render agree, so there's no
 * hydration-mismatch warning; the real value (if different) applies on the
 * client immediately after.
 */
export function useGlobalDarkMode(): boolean {
  return useSyncExternalStore(subscribeGlobalDarkMode, getGlobalDarkMode, getServerSnapshot);
}
