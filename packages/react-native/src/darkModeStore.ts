import { Appearance } from 'react-native';
import { getTheme } from './theme';

/**
 * Native port of @kbach/react's darkModeStore.ts — same architecture (a
 * single module-level store is the real source of truth;
 * ThemeProvider/useTheme are a thin, OPTIONAL wrapper around it; every
 * function here works standalone with no provider mounted anywhere), with
 * two real platform differences from the web version:
 *
 * 1. No persistence. There's no React-Native-builtin equivalent of
 *    localStorage — adding one would mean forcing a real native dependency
 *    (e.g. @react-native-async-storage/async-storage) on every consumer,
 *    even ones that don't want it. The mode always starts at 'system' on a
 *    fresh app launch. If you want persistence, read your own storage at
 *    startup (before your first render) and call setGlobalThemeMode() with
 *    the result — same "seed once, no built-in write-back" shape as
 *    seedDefaultMode() below, just driven by your own storage instead of
 *    one this package picks for you.
 * 2. `applyToDom` below IS needed here, unlike what an earlier version of
 *    this file's own comment claimed ("no DOM to apply the resolved mode
 *    to") — that reasoning only holds for real native (Android/iOS), where
 *    nativeBridge.ts's resolveStyle() reads getGlobalDarkMode() directly on
 *    every call, no DOM involved at all. This file is ALSO used by Expo
 *    Web, though (no `.web.ts` sibling — Metro has nothing to swap in), and
 *    Expo Web resolves `dark:` classes to REAL CSS with `[data-theme=
 *    "dark"]`-style selectors (see nativeBridge.web.ts) that only ever
 *    match if something writes that attribute to the DOM — nothing did,
 *    which is exactly why toggling the mode changed `useTheme()`'s own
 *    state (a consumer reading `mode`/`isDark` directly, e.g. for a label,
 *    updated correctly) while every `dark:`-prefixed style silently never
 *    applied. `typeof document === 'undefined'` is what makes one function
 *    safe on both platforms: real native's Hermes has no `document` global
 *    at all (not even `undefined` as a defined-but-empty value — genuinely
 *    unset, which `typeof` can check without throwing), so this always
 *    no-ops there, while Expo Web's react-native-web renders into a real
 *    browser DOM where it's needed.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

const listeners = new Set<() => void>();

function systemPrefersDark(): boolean {
  return Appearance.getColorScheme() === 'dark';
}

function resolveIsDark(m: ThemeMode): boolean {
  return m === 'system' ? systemPrefersDark() : m === 'dark';
}

/**
 * Writes the resolved dark/light state to the DOM, in whichever shape
 * `getTheme().darkMode` says the generated `dark:`-prefixed CSS expects —
 * this MUST stay in sync with `css.rs::wrap_dark_scheme`'s three
 * strategies, or the selector the engine generates and the attribute/class
 * this writes would silently never match. No-ops entirely on real native
 * (no `document`) and under `'media'` strategy (the generated `@media
 * (prefers-color-scheme: dark)` query already tracks the OS preference
 * directly, no DOM write needed) — `isDark` stays accurate for JS
 * consumers (`useTheme()`) either way. Mirrors @kbach/react's own
 * `applyToDom` exactly.
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

let mode: ThemeMode = 'system';
let isDark = resolveIsDark(mode);
applyToDom(isDark);
// Tracks whether setGlobalThemeMode has ever actually been called (by a
// user, or by seedDefaultMode below) — distinct from `mode !== 'system'`,
// since an explicit `setMode('system')` call is still a real choice that
// should block a later seedDefaultMode() from overriding it.
let hasExplicitChoice = false;

// Track the OS preference live while mode === 'system' — same reasoning
// as the web store's matchMedia listener: a user who hasn't made an
// explicit choice should see the app follow their OS setting even if they
// change it without restarting the app. Modern RN (>=0.65, well under
// this package's >=0.70 peer dep floor) returns a subscription object
// from addChangeListener rather than needing a separate
// removeChangeListener call.
const subscription = Appearance.addChangeListener(({ colorScheme }) => {
  if (mode !== 'system') return;
  isDark = colorScheme === 'dark';
  applyToDom(isDark);
  notify();
});

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Re-applies the CURRENT `isDark` value to the DOM (Expo Web only — a
 * genuine no-op on real native, same as `applyToDom` itself) under whatever
 * `getTheme().darkMode` strategy is active right now, with no change to
 * `mode`/`isDark` themselves, so it deliberately does NOT `notify()`.
 * Mirrors @kbach/react's identical `resyncDomWithActiveTheme` — see that
 * one's own doc comment for the full race it fixes: this module's initial
 * `applyToDom(isDark)` call (above) runs at IMPORT time against whichever
 * `darkMode` strategy `defaultTheme` had at that moment, which on Expo Web
 * is BEFORE an app's own `applyKbachConfig({darkMode: 'attribute'})` call
 * (in config.ts) has had a chance to switch it — without this, that config
 * call would silently never get its `dark:` classes to apply on initial
 * load, even though `useTheme().isDark` already reads correctly.
 */
export function resyncDomWithActiveTheme(): void {
  applyToDom(isDark);
}

export function getGlobalDarkMode(): boolean {
  return isDark;
}

export function getGlobalThemeMode(): ThemeMode {
  return mode;
}

/** Explicit user choice — takes priority over any later `<ThemeProvider defaultMode>` seed (see `seedDefaultMode` below). Not persisted; see this module's own doc comment. */
export function setGlobalThemeMode(nextMode: ThemeMode): void {
  mode = nextMode;
  isDark = resolveIsDark(nextMode);
  hasExplicitChoice = true;
  applyToDom(isDark);
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
 * Applies `fallback` as the initial mode, but ONLY if nothing has made an
 * explicit choice yet — called once by `<ThemeProvider defaultMode>` on
 * mount, never exported for direct use elsewhere. Unlike the web store,
 * there's no persisted-value check here (nothing to check); the only
 * thing that can beat a seed is a `setGlobalThemeMode()` call that
 * happened first (e.g. your own storage-restore logic run before the
 * provider mounts).
 */
export function seedDefaultMode(fallback: ThemeMode): void {
  if (hasExplicitChoice || mode === fallback) return;
  mode = fallback;
  isDark = resolveIsDark(fallback);
  applyToDom(isDark);
  notify();
}

/** Exported for tests only — resets every module-level field back to its as-if-just-imported state. */
export function _resetForTests(): void {
  mode = 'system';
  isDark = resolveIsDark(mode);
  hasExplicitChoice = false;
  listeners.clear();
}

/** Exported for tests only — removes the Appearance change subscription so a test's mock doesn't leak into the next one. */
export function _unsubscribeForTests(): void {
  subscription.remove();
}
