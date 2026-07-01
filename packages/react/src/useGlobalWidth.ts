import React from 'react';
import { isWeb } from './core/platform';
import { getGlobalWidth, subscribeGlobalWidth } from './core';

// useSyncExternalStore polyfill — same pattern as useGlobalDarkMode.ts
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

const NOOP_SUB = (_: () => void): (() => void) => () => {};
const ZERO_SNAP = (): number => 0;
const EMPTY_BREAKPOINTS = new Set<string>();

// ─── Web: direct window.resize subscription ───────────────────────────────────
// The global store (subscribeGlobalWidth / setGlobalWidth) works reliably on
// native but can miss updates on web due to React 18 batching behaviour.
// On web we bypass it and subscribe directly to the resize event so DarkWrapper
// and InteractiveWrapper always re-render with the live window.innerWidth.

let _webListeners: Set<() => void> | null = null;
let _webRaf = 0;

function _webResizeHandler(): void {
  cancelAnimationFrame(_webRaf);
  _webRaf = requestAnimationFrame(() => {
    if (_webListeners) for (const cb of _webListeners) cb();
  });
}

function subscribeWebWidth(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!_webListeners) {
    _webListeners = new Set();
    window.addEventListener('resize', _webResizeHandler);
  }
  _webListeners.add(cb);
  return () => {
    _webListeners!.delete(cb);
    if (_webListeners!.size === 0) {
      window.removeEventListener('resize', _webResizeHandler);
      cancelAnimationFrame(_webRaf);
      _webListeners = null;
    }
  };
}

function getWebWidth(): number {
  return typeof window !== 'undefined' ? window.innerWidth : 0;
}

// ─── Public hooks ─────────────────────────────────────────────────────────────

/**
 * Subscribe to the current window width.
 * On web: direct window.resize listener → always returns live window.innerWidth.
 * On native: reads from the global store updated by NativeThemeProvider.
 */
export function useGlobalWidth(): number {
  return useSyncExternalStore(
    isWeb ? subscribeWebWidth : subscribeGlobalWidth,
    isWeb ? getWebWidth : getGlobalWidth,
    ZERO_SNAP,
  );
}

/**
 * Like useGlobalWidth but opts out when `active` is false.
 * When inactive, returns 0 and does not subscribe — no re-renders on resize.
 */
export function useConditionalWidth(active: boolean): number {
  return useSyncExternalStore(
    active ? (isWeb ? subscribeWebWidth : subscribeGlobalWidth) : NOOP_SUB,
    active ? (isWeb ? getWebWidth : getGlobalWidth) : ZERO_SNAP,
    ZERO_SNAP,
  );
}

export { EMPTY_BREAKPOINTS };
