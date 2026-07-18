import React from 'react';

/**
 * useSyncExternalStore is React 18+. Polyfill for React 17.
 * Shared by useGlobalWidth.ts and useGlobalDarkMode.ts.
 */
export const useSyncExternalStore: typeof React.useSyncExternalStore =
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
