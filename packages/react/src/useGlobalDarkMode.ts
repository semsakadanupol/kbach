import { getGlobalDarkMode, subscribeGlobalDarkMode } from './core';
import { useSyncExternalStore } from './useSyncExternalStoreShim';

const NOOP_SUB = (_: () => void): (() => void) => () => {};
const FALSE_SNAP = (): boolean => false;

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

/**
 * Like useGlobalDarkMode but opts out when `active` is false: returns `false`
 * and does not subscribe, so a theme toggle causes no re-render. For
 * InteractiveWrapper/DarkWrapper/styled(), whose only use of `isDark` is
 * computing an inline-style fallback that's itself skipped on web (CSS
 * `dark:`/`light:` selectors already handle it there) — subscribing anyway
 * would re-render every wrapped element on every theme toggle for no visible
 * effect.
 */
export function useConditionalGlobalDarkMode(active: boolean): boolean {
  return useSyncExternalStore(
    active ? subscribeGlobalDarkMode : NOOP_SUB,
    active ? getGlobalDarkMode : FALSE_SNAP,
    FALSE_SNAP,
  );
}
