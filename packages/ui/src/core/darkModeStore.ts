/**
 * Module-level dark-mode singleton.
 *
 * This intentionally lives outside React so the custom JSX runtime can read it
 * synchronously during render without needing context. ThemeProvider writes to it;
 * DarkWrapper / InteractiveWrapper subscribe via useSyncExternalStore.
 *
 * Backed by getGlobalSingleton() (globalThis-keyed), not a plain module-level
 * variable — core/ being built as its own shared dist/core/ entry (see
 * tsup.config.ts's CORE_EXTERNAL) only guarantees one instance across the CJS
 * build (dist/index.js, dist/jsx-runtime.js, dist/jsx-dev-runtime.js). The
 * separate ESM build (dist/index.mjs etc., required for Rollup/Vite — see
 * context.tsx's ThemeContext comment) inlines its own copy, and Metro can
 * route different call sites in the same app through either one. Confirmed
 * as a real bug this way: dark:/light: classes went completely inert (while
 * useIsDark() kept reading correctly) in an app mixing
 * `import ... from '@kbach/ui/native'` and `import ... from '@kbach/ui'`
 * — the two ended up on different physical copies of this store.
 */

import { getGlobalSingleton } from './globalSingleton';

interface KbachDarkStore {
  isDark: boolean;
  /**
   * Last value subscribers were actually notified with — deliberately
   * separate from `isDark`. syncGlobalDarkMode() also writes `isDark`
   * (synchronously, during render, before setGlobalDarkMode's effect ever
   * runs); if setGlobalDarkMode compared against `isDark` itself, it would
   * always find them already equal (syncGlobalDarkMode having just set it to
   * the same value moments earlier in the same render pass) and skip
   * notifying every single time — subscribers would never re-render on a
   * theme toggle. Comparing against this separately-tracked value instead
   * means the skip-if-unchanged check only fires when nothing has *actually*
   * changed since the last real notification.
   */
  notifiedIsDark: boolean;
  subscribers: Set<() => void>;
}

const store: KbachDarkStore = getGlobalSingleton('darkModeStore', () => ({
  isDark: false,
  notifiedIsDark: false,
  subscribers: new Set<() => void>(),
}));

/**
 * Silently update isDark without notifying subscribers.
 * Safe to call during React's render phase — no state side-effects.
 * ThemeProvider calls this before returning JSX so the JSX runtime and
 * children that call getGlobalDarkMode() during the same render pass
 * already see the correct value.
 */
export function syncGlobalDarkMode(isDark: boolean): void {
  store.isDark = isDark;
}

/**
 * Update isDark and notify all subscribers.
 * Called by ThemeProvider in a layout effect (after commit) so DarkWrapper /
 * InteractiveWrapper consumers re-render with the updated dark-mode value.
 * Notifications are skipped when the value hasn't changed since the last
 * broadcast to avoid spurious re-renders — see the notifiedIsDark comment
 * above for why that comparison can't use `isDark` itself.
 */
export function setGlobalDarkMode(isDark: boolean): void {
  store.isDark = isDark;
  if (store.notifiedIsDark === isDark) return;
  store.notifiedIsDark = isDark;
  for (const sub of store.subscribers) sub();
}

/** Read current dark-mode state synchronously (safe in render, no hook needed). */
export function getGlobalDarkMode(): boolean {
  return store.isDark;
}

/**
 * Subscribe to dark-mode changes.
 * @returns Cleanup function — call it to unsubscribe (no leak).
 */
export function subscribeGlobalDarkMode(callback: () => void): () => void {
  store.subscribers.add(callback);
  return () => store.subscribers.delete(callback);
}
