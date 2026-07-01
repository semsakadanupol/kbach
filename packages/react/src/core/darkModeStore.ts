/**
 * Module-level dark-mode singleton.
 *
 * This intentionally lives outside React so the custom JSX runtime can read it
 * synchronously during render without needing context. ThemeProvider writes to it;
 * DarkWrapper / InteractiveWrapper subscribe via useSyncExternalStore.
 *
 * CJS bundle isolation problem:
 *   tsup creates separate self-contained CJS bundles for dist/index.js and
 *   dist/jsx-runtime.js. Metro (React Native) requires each by its file path,
 *   so they get independent module instances — top-level variables are NOT shared.
 *   ESM works because tsup extracts a shared chunk; CJS does not.
 *
 *   Fix: park the mutable state on globalThis so both CJS bundles read and
 *   write the same object. The globalThis key is intentionally namespaced to
 *   avoid collisions.
 */

interface KbachDarkStore {
  isDark: boolean;
  subscribers: Set<() => void>;
}

const KEY = '__kbach_dark_store__';

function getStore(): KbachDarkStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[KEY]) {
    g[KEY] = { isDark: false, subscribers: new Set<() => void>() };
  }
  return g[KEY] as KbachDarkStore;
}

/**
 * Silently update isDark without notifying subscribers.
 * Safe to call during React's render phase — no state side-effects.
 * ThemeProvider calls this before returning JSX so the JSX runtime and
 * children that call getGlobalDarkMode() during the same render pass
 * already see the correct value.
 */
export function syncGlobalDarkMode(isDark: boolean): void {
  getStore().isDark = isDark;
}

/**
 * Update isDark and notify all subscribers.
 * Called by ThemeProvider in useEffect (after render) so DarkWrapper /
 * InteractiveWrapper consumers re-render with the updated dark-mode value.
 * Notifications are skipped when the value hasn't changed since the last
 * broadcast to avoid spurious re-renders.
 */
export function setGlobalDarkMode(isDark: boolean): void {
  const store = getStore();
  if (store.isDark === isDark) return;
  store.isDark = isDark;
  for (const sub of store.subscribers) sub();
}

/** Read current dark-mode state synchronously (safe in render, no hook needed). */
export function getGlobalDarkMode(): boolean {
  return getStore().isDark;
}

/**
 * Subscribe to dark-mode changes.
 * @returns Cleanup function — call it to unsubscribe (no leak).
 */
export function subscribeGlobalDarkMode(callback: () => void): () => void {
  const store = getStore();
  store.subscribers.add(callback);
  return () => store.subscribers.delete(callback);
}
