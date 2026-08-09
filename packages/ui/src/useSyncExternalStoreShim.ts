import React from 'react';

/**
 * useSyncExternalStore is React 18+. Polyfill for React 17 — in practice this
 * fallback is rarely reached, since the package.json peerDependency requires
 * react >=18.0.0; it only matters if a consumer installs React 17 anyway.
 * Shared by useGlobalWidth.ts and useGlobalDarkMode.ts.
 */
export const useSyncExternalStore: typeof React.useSyncExternalStore =
  (React as any).useSyncExternalStore ??
  function useSyncExternalStoreFallback<T>(
    subscribe: (cb: () => void) => () => void,
    getSnapshot: () => T,
    getServerSnapshot?: () => T,
  ): T {
    // The real useSyncExternalStore calls getServerSnapshot() (not
    // getSnapshot()) whenever there's no `window` to read live state from —
    // this fallback previously ignored that argument entirely and always
    // called getSnapshot(). On React 17 SSR (renderToString) in a long-lived
    // Node process, that meant reading the same process-wide singleton a
    // later request could concurrently mutate (e.g. darkModeStore.ts's
    // globalThis-backed store), instead of the caller's intended server-safe
    // default — one request's SSR output could reflect a different request's
    // state.
    const isServer = typeof window === 'undefined';
    const [, forceUpdate] = React.useReducer((n: number) => n + 1, 0);
    const value = isServer && getServerSnapshot ? getServerSnapshot() : getSnapshot();

    React.useEffect(() => {
      // Re-check once after subscribing: the store may have changed in the
      // gap between this render's snapshot read above and the listener
      // actually attaching here (e.g. a matchMedia 'change' event firing in
      // that window) — the real useSyncExternalStore does the same check so
      // that gap doesn't silently drop an update until some unrelated later
      // change happens to fire.
      if (getSnapshot() !== value) forceUpdate();
      return subscribe(forceUpdate);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscribe]);

    return value;
  };
