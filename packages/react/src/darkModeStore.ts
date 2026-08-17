import { getTheme } from './theme';

/**
 * Port of old-kbach's dark-mode architecture (`packages/ui/src/core/
 * darkModeStore.ts` + `ThemeProvider.tsx`), simplified for this package's
 * web-only scope: a single module-level store is the actual source of
 * truth, and `<ThemeProvider>`/`useTheme()` (see `ThemeProvider.tsx`) are a
 * thin, OPTIONAL React wrapper around it — every function here works
 * standalone, with no provider mounted anywhere, which is the whole point:
 * a plain script, an event handler, or a component that never wants
 * Context can call `toggleGlobalDarkMode()` directly.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'kbach-theme';
const listeners = new Set<() => void>();

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// `window.localStorage`, not the bare `localStorage` global — Node 22+
// ships its own experimental global `localStorage` getter (unrelated to
// jsdom's), which shadows/conflicts with jsdom's actual implementation
// under Vitest and throws "Cannot read properties of undefined" when
// accessed. `window.localStorage` unambiguously reaches jsdom's version in
// tests, and is equally correct in a real browser (where `window` and the
// bare global refer to the exact same object anyway).
function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function readPersistedMode(): ThemeMode | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
  } catch {
    return null; // Private-browsing / storage-disabled — localStorage access can throw, not just return null.
  }
}

function resolveIsDark(m: ThemeMode): boolean {
  return m === 'system' ? systemPrefersDark() : m === 'dark';
}

/**
 * Writes the resolved dark/light state to the DOM, in whichever shape
 * `getTheme().darkMode` says the generated `dark:`-prefixed CSS expects —
 * this MUST stay in sync with `css.rs::wrap_dark_scheme`'s three
 * strategies, or the selector the engine generates and the attribute/class
 * this writes would silently never match. `'media'` strategy needs no DOM
 * write at all: `prefers-color-scheme` in the generated `@media` query
 * already tracks the OS preference directly; this store still keeps
 * `isDark` accurate for JS consumers (`useGlobalDarkMode()`, `useTheme()`)
 * even though there's nothing to touch on the element itself.
 */
function applyToDom(dark: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const strategy = getTheme().darkMode;
  if (strategy === 'class') {
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
  } else if (strategy === 'attribute') {
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}

// Module-level initial state, computed ONCE at import time — deliberately
// NOT lazily computed on first function call. On a real client bootstrap,
// this module's top-level code runs before the app ever renders, so there
// is no race between "a component's first render reads a placeholder
// default" and "something later tries to apply the real persisted value."
// A lazy-init-on-first-access design would have exactly that race against
// `<ThemeProvider defaultMode>` (see that file). Safe under SSR too:
// `readPersistedMode`/`systemPrefersDark` both no-op (return null/false)
// when `window`/`localStorage` don't exist, so this module still imports
// cleanly on the server, and `applyToDom` is guarded the same way.
const persistedMode = readPersistedMode();
const hadPersistedMode = persistedMode !== null;
let mode: ThemeMode = persistedMode ?? 'system';
let isDark = resolveIsDark(mode);
applyToDom(isDark);

// Track the OS preference live while `mode === 'system'` — a user who
// hasn't made an explicit light/dark choice should see the app follow
// their OS setting even if they change it without reloading the page.
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  // Reads `event.matches` directly rather than re-querying
  // `systemPrefersDark()` from scratch — the `MediaQueryListEvent` the
  // browser fires already carries the fresh value, which is the whole
  // point of the event payload; re-deriving it via a second `matchMedia()`
  // call is both redundant and, in a test/mock environment where the
  // `MediaQueryList` object isn't a live-updating browser object, actually
  // wrong (it would read the STALE value the mock was constructed with).
  const onSystemChange = (event: MediaQueryListEvent) => {
    if (mode !== 'system') return;
    isDark = event.matches;
    applyToDom(isDark);
    notify();
  };
  // `addEventListener` is the modern API; `addListener` is the
  // deprecated-but-still-required fallback for older Safari.
  if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  else mq.addListener(onSystemChange);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function getGlobalDarkMode(): boolean {
  return isDark;
}

export function getGlobalThemeMode(): ThemeMode {
  return mode;
}

/** Explicit user choice — persisted, and takes priority over any later `<ThemeProvider defaultMode>` seed (see `seedDefaultMode` below). */
export function setGlobalThemeMode(nextMode: ThemeMode): void {
  mode = nextMode;
  isDark = resolveIsDark(nextMode);
  applyToDom(isDark);
  const ls = storage();
  if (ls) {
    try {
      ls.setItem(STORAGE_KEY, nextMode);
    } catch {
      // Private-browsing / storage-disabled / quota exceeded — the toggle
      // still works for this session, it just won't survive a reload.
    }
  }
  notify();
}

export function toggleGlobalDarkMode(): void {
  setGlobalThemeMode(isDark ? 'light' : 'dark');
}

export function subscribeGlobalDarkMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Applies `fallback` as the initial mode, but ONLY if the user has never
 * made an explicit choice (nothing was found in `localStorage` at module
 * load) — called once by `<ThemeProvider defaultMode>` on mount, never
 * exported for direct use elsewhere. Deliberately does NOT persist to
 * `localStorage`: this is the app's own DEFAULT, not a real user
 * preference, so a later code change to `defaultMode` isn't permanently
 * masked by an old default that got saved as if it were a genuine choice.
 */
export function seedDefaultMode(fallback: ThemeMode): void {
  if (hadPersistedMode || mode === fallback) return;
  mode = fallback;
  isDark = resolveIsDark(fallback);
  applyToDom(isDark);
  notify();
}

/** Exported for tests only — resets every module-level field back to its as-if-just-imported state. */
export function _resetForTests(): void {
  mode = 'system';
  isDark = resolveIsDark(mode);
  listeners.clear();
}
