import { Appearance, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';
import { getThemeJson } from './theme';

export interface StyleObject {
  [key: string]: string | number;
}

/**
 * Structurally matches apps/native-sandbox/specs/NativeKbachModule.ts's
 * `Spec` (the one Codegen actually reads) — not imported from there
 * directly, since that would add a dependency edge from this package onto
 * a specific consuming app. Any file can call
 * `TurboModuleRegistry.getEnforcing<Spec>('KbachModule')` with its own
 * locally-defined, structurally-matching interface; Codegen only needs to
 * find *a* `Native*.ts` spec file within the app's `jsSrcsDir` to generate
 * the native glue that `KbachModule.kt` implements.
 */
interface Spec extends TurboModule {
  generateCss(classString: string, themeJson: string): string;
  resolveStyle(classString: string, themeJson: string, colorScheme: string, pressed: boolean): string;
}

/**
 * Calls the Rust engine via the KbachModule TurboModule (see
 * apps/native-sandbox/android/.../KbachModule.kt and
 * packages/core-engine/src/resolve_style.rs) and returns a plain style
 * object ready for RN's `style` prop. Synchronous — no async init step,
 * unlike the web/WASM path, since JSI-backed TurboModule methods are
 * available as soon as the module is loaded.
 *
 * Reads `Appearance.getColorScheme()` fresh on every call (no caching) so
 * `dark:` resolves correctly whenever this runs — but this function itself
 * has no subscription of its own, so nothing re-renders just because the
 * system theme changed. Whatever calls this (jsx-runtime, on every render)
 * only runs again if something in the tree opts into that reactivity, e.g.
 * by calling React Native's own `useColorScheme()` hook — see
 * apps/native-sandbox/App.tsx.
 *
 * Phase 11 originally shipped with live in-place theme switching unverified
 * (a `uiMode` toggle triggered a re-render but `Appearance.getColorScheme()`
 * kept returning a stale value). Root-caused in Phase 12 while debugging an
 * unrelated `active:` failure: `apps/native-sandbox` has its own separate
 * `node_modules/react-native` (excluded from the npm workspace since Phase
 * 5), while `packages/react-native` resolved `react-native` hierarchically
 * up to a *different* copy at the repo root — two physical module
 * instances, so `useColorScheme()`'s subscription and this function's
 * `Appearance.getColorScheme()` read were silently talking to two separate
 * copies of the Appearance module. Fixed by forcing a single instance via
 * `resolver.resolveRequest` in apps/native-sandbox/metro.config.js; live
 * theme switching (and `active:`, the bug that surfaced this) both verified
 * working after the fix — see Phase 12.
 *
 * `pressed` gates the `active:` modifier — unlike `colorScheme`, there's no
 * system-level getter for "is this element currently pressed"; only RN's
 * `Pressable` ever knows this, so it's passed in directly by the caller
 * (jsx-runtime, from Pressable's own style-function callback) rather than
 * queried here. Defaults to `false` for every other element type.
 */
export function resolveStyle(classString: string, pressed = false): StyleObject {
  const KbachModule = TurboModuleRegistry.getEnforcing<Spec>('KbachModule');
  const colorScheme = Appearance.getColorScheme() ?? 'light';
  const json = KbachModule.resolveStyle(classString, getThemeJson(), colorScheme, pressed);
  return JSON.parse(json) as StyleObject;
}
