/**
 * Global responsive width store.
 *
 * Backed by getGlobalSingleton() (globalThis-keyed) — see
 * darkModeStore.ts's header comment for why a plain module-level object
 * isn't enough: core/ being its own shared dist/core/ entry only covers the
 * CJS build (dist/index.js, dist/jsx-runtime.js, dist/jsx-dev-runtime.js);
 * the separate ESM build inlines its own copy, and Metro can route
 * different call sites in the same app through either one.
 */

import { getGlobalSingleton } from './globalSingleton';

type WidthListener = () => void;

interface ResponsiveStore {
  width: number;
  /**
   * Last value listeners were actually notified with — kept separate from
   * `width` for the same reason darkModeStore.ts's notifiedIsDark is kept
   * separate from isDark: syncGlobalWidth() also writes `width`
   * synchronously during render, before setGlobalWidth's effect ever runs.
   * Comparing setGlobalWidth's skip-if-unchanged check against `width`
   * itself would always find them already equal (syncGlobalWidth having
   * just set it to the same value moments earlier in the same render pass)
   * and never actually notify listeners on a real width change.
   */
  notifiedWidth: number;
  screens: Record<string, number>;
  listeners: Set<WidthListener>;
}

const store: ResponsiveStore = getGlobalSingleton('responsiveStore', () => ({
  width: 0,
  notifiedWidth: 0,
  screens: {},
  listeners: new Set<WidthListener>(),
}));

/** Synchronous write for use in the render phase. */
export function syncGlobalWidth(width: number): void {
  store.width = width;
}

/** Update the breakpoint-name → min-width map from the resolved theme config. */
export function syncGlobalScreens(screens: Record<string, number>): void {
  store.screens = screens;
}

export function getGlobalScreens(): Record<string, number> {
  return store.screens;
}

/**
 * Async write — fires listeners so subscribers re-render. Skip check uses
 * notifiedWidth, not width — see the ResponsiveStore.notifiedWidth comment.
 */
export function setGlobalWidth(width: number): void {
  store.width = width;
  if (store.notifiedWidth === width) return;
  store.notifiedWidth = width;
  for (const l of store.listeners) l();
}

export function getGlobalWidth(): number {
  return store.width;
}

export function subscribeGlobalWidth(listener: WidthListener): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

/**
 * Returns the Set of breakpoint names that are currently active
 * (i.e. width >= their min-width threshold).
 *
 * `screens` defaults to the global store's screens map (the common case —
 * DarkWrapper/InteractiveWrapper have no per-tree config available). Pass an
 * explicit map to check against a LOCAL config instead — e.g. useBreakpoint()/
 * useResponsive() pass the nearest <ThemeProvider>'s own `config.theme.screens`
 * so they stay correct per-provider rather than silently reading whichever
 * config the global store happens to hold (see ThemeProvider's per-tree
 * config-override limitation).
 */
export function getActiveBreakpoints(width?: number, screens?: Record<string, number>): Set<string> {
  const w = width ?? store.width;
  const s = screens ?? store.screens;
  const active = new Set<string>();
  for (const [name, minW] of Object.entries(s)) {
    if (typeof minW === 'number' && w >= minW) active.add(name);
  }
  return active;
}
