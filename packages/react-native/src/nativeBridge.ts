import { Dimensions, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';
import { getTheme, getThemeJson } from './theme';
import { getGlobalDarkMode } from './darkModeStore';
import { resolveStyleJs } from './jsEngine/resolveStyle';

// A plain string/number style value, OR the one nested shape RN's own style
// system has no flat equivalent for — `shadowOffset: {width, height}`,
// which both the JNI engine (resolve_style.rs) and the JS engine
// (jsEngine/resolveStyle.ts) assemble from two synthetic flat declarations
// before returning. See jsEngine/resolveStyle.ts's own doc comment.
export type StyleValue = string | number | { width: number; height: number };
export interface StyleObject {
  [key: string]: StyleValue;
}

/**
 * Structurally matches ../specs/NativeKbachModule.ts's `Spec` (the one
 * Codegen actually reads) — not imported from there directly, since
 * `TurboModuleRegistry.getEnforcing` only needs a structurally-matching
 * interface at the call site, not the literal spec file; `specs/` exists
 * purely for Codegen's own `jsSrcsDir` scan (see that file's own doc
 * comment), not as something app code is meant to import from.
 */
interface Spec extends TurboModule {
  generateCss(classString: string, themeJson: string): string;
  // `width`: a plain `number` (not the `Int32`/`Float` CodegenTypes
  // aliases) is Codegen's own default float-numeric mapping — it already
  // compiles to Kotlin's `Double` on the native side, so no explicit
  // `Double` type alias import is needed here.
  resolveStyle(classString: string, themeJson: string, colorScheme: string, pressed: boolean, width: number): string;
}

/**
 * Calls the Rust engine via the KbachModule TurboModule (see
 * apps/native-sandbox/android/.../KbachModule.kt and
 * packages/core-engine/src/resolve_style.rs) and returns a plain style
 * object ready for RN's `style` prop. Synchronous — no async init step,
 * unlike the web/WASM path, since JSI-backed TurboModule methods are
 * available as soon as the module is loaded.
 *
 * Reads `getGlobalDarkMode()` (darkModeStore.ts) fresh on every call (no
 * caching) so `dark:` resolves correctly whenever this runs. That store —
 * not a direct `Appearance.getColorScheme()` read, which this function
 * used prior to `<ThemeProvider>` support — is what makes an explicit
 * `setGlobalThemeMode('dark')`/`toggle()` override actually affect
 * rendering; the store itself falls back to tracking `Appearance` live
 * whenever the mode is `'system'` (its own default), so nothing regresses
 * for apps that never touch the override API at all. This function itself
 * has no subscription of its own, so nothing re-renders just because the
 * store's value changed — call `useTheme()` (its `isDark`) somewhere in
 * the tree for that, NOT React Native's own `useColorScheme()`, which only
 * reflects the raw OS setting and would miss an explicit override entirely.
 *
 * Phase 11 originally shipped with live in-place theme switching unverified
 * (a `uiMode` toggle triggered a re-render but `Appearance.getColorScheme()`
 * kept returning a stale value). Root-caused in Phase 12 while debugging an
 * unrelated `active:` failure: `apps/native-sandbox` has its own separate
 * `node_modules/react-native` (excluded from the npm workspace since Phase
 * 5), while `packages/react-native` resolved `react-native` hierarchically
 * up to a *different* copy at the repo root — two physical module
 * instances, so a `useColorScheme()` subscription and an
 * `Appearance.getColorScheme()` read were silently talking to two separate
 * copies of the Appearance module. Fixed by forcing a single instance via
 * `resolver.resolveRequest` in apps/native-sandbox/metro.config.js; live
 * theme switching (and `active:`, the bug that surfaced this) both verified
 * working after the fix — see Phase 12. Still relevant here: darkModeStore.ts
 * itself calls `Appearance.addChangeListener`, so the same dual-instance
 * failure mode would silently break the 'system' fallback path too if that
 * metro.config.js fix ever regressed.
 *
 * `pressed` gates the `active:` modifier — unlike `colorScheme`, there's no
 * system-level getter for "is this element currently pressed"; only RN's
 * `Pressable` ever knows this, so it's passed in directly by the caller
 * (jsx-runtime, from Pressable's own style-function callback) rather than
 * queried here. Defaults to `false` for every other element type.
 *
 * `width` gates `sm:`/`md:`/`lg:`/`xl:`/`2xl:` against the active theme's
 * `screens` scale (resolve_style.rs's `native_modifier_state`) — read fresh
 * from `Dimensions.get('window').width` on every call, the same "no
 * caching, no store" choice `colorScheme`/`pressed` already make, and for
 * the same reason: unlike dark mode there's no explicit-override concept to
 * preserve here (nobody manually overrides their screen width), so a plain
 * synchronous read is enough — no need for the subscribable store
 * darkModeStore.ts is for. As with `colorScheme`, this function has no
 * subscription of its own, so rotating/resizing the window doesn't
 * re-render anything by itself — call RN's own `useWindowDimensions()`
 * somewhere in the tree for that (same role `useColorScheme()` plays for
 * `dark:` in apps/native-sandbox/App.tsx).
 *
 * Falls back to `./jsEngine` (a pure-JS, no-WASM/no-native reimplementation
 * of this same resolution logic — see that directory's own doc comments)
 * when `KbachModule` isn't registered at all — Expo Go, which can never
 * load ANY custom native module (not even Expo's own Modules API), so the
 * TurboModule this file otherwise depends on simply doesn't exist there.
 * `TurboModuleRegistry.get` (not `.getEnforcing`, which throws) is what
 * makes this detectable at all — `get` returns `null`/`undefined` instead.
 * A real dev-client/CLI build always has the module registered, so this
 * fallback only ever activates in Expo Go itself; everywhere else behaves
 * exactly as before. The JS engine covers a strict subset of what the
 * native/WASM engines resolve (see jsEngine/resolveUtilityNative.ts) — an
 * intentional, documented parity gap, not a bug.
 */
export function resolveStyle(classString: string, pressed = false): StyleObject {
  const colorScheme = getGlobalDarkMode() ? 'dark' : 'light';
  const width = Dimensions.get('window').width;
  const KbachModule = TurboModuleRegistry.get<Spec>('KbachModule');
  if (!KbachModule) {
    return resolveStyleJs(classString, getTheme(), colorScheme, pressed, width);
  }
  const json = KbachModule.resolveStyle(classString, getThemeJson(), colorScheme, pressed, width);
  return JSON.parse(json) as StyleObject;
}
