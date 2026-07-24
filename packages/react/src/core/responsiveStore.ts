/**
 * Global responsive width store — backed by globalThis so all CJS bundle
 * splits (index.js, jsx-runtime.js, jsx-dev-runtime.js) share one instance.
 */

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

const RESPONSIVE_KEY = '__kbach_responsive__';

function getStore(): ResponsiveStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[RESPONSIVE_KEY]) {
    g[RESPONSIVE_KEY] = { width: 0, notifiedWidth: 0, screens: {}, listeners: new Set<WidthListener>() };
  }
  return g[RESPONSIVE_KEY] as ResponsiveStore;
}

/** Synchronous write for use in the render phase. */
export function syncGlobalWidth(width: number): void {
  getStore().width = width;
}

/** Update the breakpoint-name → min-width map from the resolved theme config. */
export function syncGlobalScreens(screens: Record<string, number>): void {
  getStore().screens = screens;
}

export function getGlobalScreens(): Record<string, number> {
  return getStore().screens;
}

/**
 * Async write — fires listeners so subscribers re-render. Skip check uses
 * notifiedWidth, not width — see the ResponsiveStore.notifiedWidth comment.
 */
export function setGlobalWidth(width: number): void {
  const store = getStore();
  store.width = width;
  if (store.notifiedWidth === width) return;
  store.notifiedWidth = width;
  for (const l of store.listeners) l();
}

export function getGlobalWidth(): number {
  return getStore().width;
}

export function subscribeGlobalWidth(listener: WidthListener): () => void {
  const store = getStore();
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

/**
 * Returns the Set of breakpoint names that are currently active
 * (i.e. width >= their min-width threshold).
 */
export function getActiveBreakpoints(width?: number): Set<string> {
  const store = getStore();
  const w = width ?? store.width;
  const active = new Set<string>();
  for (const [name, minW] of Object.entries(store.screens)) {
    if (typeof minW === 'number' && w >= minW) active.add(name);
  }
  return active;
}
