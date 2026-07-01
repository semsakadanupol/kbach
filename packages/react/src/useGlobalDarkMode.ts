import React from 'react';
import { getGlobalDarkMode, subscribeGlobalDarkMode } from './core';

// useSyncExternalStore is React 18+. Polyfill for React 17.
const useSyncExternalStore: typeof React.useSyncExternalStore =
  (React as any).useSyncExternalStore ??
  function useSyncExternalStoreFallback<T>(
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => T,
    _getServerSnapshot?: () => T,
  ): T {
    const [, forceUpdate] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => subscribe(forceUpdate), [subscribe]);
    return getSnapshot();
  };

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
