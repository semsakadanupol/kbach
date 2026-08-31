import { Dimensions, TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';
import { getTheme, getThemeJson } from './theme';
import { getGlobalDarkMode } from './darkModeStore';
import { resolveStyleJsWithWarnings } from './jsEngine/resolveStyle';

// A plain string/number style value, OR one of the two nested shapes RN's
// own style system has no flat equivalent for: `shadowOffset: {width,
// height}` and `transform: [{translateX: 16}, {rotate: '45deg'}, ...]` —
// both assembled from synthetic flat marker declarations (shadow-offset-x/y,
// transform-op-*) by both the JNI engine (resolve_style.rs) and the JS
// engine (jsEngine/resolveStyle.ts) before returning. See those files' own
// accumulator doc comments.
// Not exported — only StyleObject (below) is part of this file's public
// surface; nothing outside needs the value type on its own.
type StyleValue =
  | string
  | number
  | { width: number; height: number }
  | Array<Record<string, string | number>>;
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
 *
 * An arbitrary value that couldn't be resolved to something RN's style
 * system can actually use (an unreduced percentage/viewport-relative
 * `calc()`, a raw `var(...)`, ...) is dropped from the returned style —
 * never passed through as an invalid string — and surfaced via
 * `console.warn` here (dev builds only, mirroring RN's own convention for
 * this kind of non-fatal correctness warning) rather than failing
 * silently. The native/JNI path embeds these under a `"__kbachWarnings"`
 * key in the same JSON `resolve_style_json` already returns (see that
 * function's own doc comment for why — reusing the one JSON round-trip
 * rather than adding a second FFI call); the jsEngine fallback returns
 * them directly via `resolveStyleJsWithWarnings`. Both paths converge here
 * so call sites never need to know which engine actually resolved anything.
 */
// resolveStyle's result is a pure function of (classString, pressed,
// colorScheme, width, the active theme) — every render of every styled
// element calls this fresh, though, with no way to skip the work even when
// none of those inputs actually changed since the last call (jsx()/jsxs()
// are plain functions invoked by the JSX transform on every render, not a
// component that could hold its own useMemo — see jsxRuntimeCore.ts's own
// doc comments). This cache fills that gap: a `dark:`/breakpoint: element
// re-rendering because darkModeStore ticked, or a parent re-rendering with
// an unchanged static className, both hit the same cached style object
// instead of re-crossing the JNI/WASM bridge and re-resolving from scratch.
// Cleared wholesale (not evicted one entry at a time) once it exceeds
// RESOLVE_STYLE_CACHE_MAX — bounds memory for an app that builds many
// distinct/one-off class strings (or sweeps `width` through many values
// during a resize/rotation animation) without needing real LRU bookkeeping;
// the cost of an occasional full-cache miss is far cheaper than the
// unbounded growth a never-evicted cache would risk.
const RESOLVE_STYLE_CACHE_MAX = 500;
const resolveStyleCache = new Map<string, StyleObject>();
// Reference, not content — getThemeJson() returns the SAME string instance
// until setTheme() reassigns it (see theme.ts), so comparing references is
// enough to detect "the theme changed since the cache was built" for free.
let cachedForThemeJson: string | null = null;

export function resolveStyle(classString: string, pressed = false): StyleObject {
  const colorScheme = getGlobalDarkMode() ? 'dark' : 'light';
  const width = Dimensions.get('window').width;
  const themeJson = getThemeJson();
  if (themeJson !== cachedForThemeJson) {
    resolveStyleCache.clear();
    cachedForThemeJson = themeJson;
  }

  const cacheKey = `${classString} ${pressed} ${colorScheme} ${width}`;
  const cached = resolveStyleCache.get(cacheKey);
  // A fresh shallow copy on every return (cached or not) — callers
  // downstream (resolvedStyleFor's `Object.assign(resolved, layoutOverrides)`
  // in jsxRuntimeCore.ts) mutate the object this returns in place, which was
  // always safe when every call produced a genuinely fresh object; sharing
  // the SAME cached object across calls would let one caller's mutation leak
  // into every other cache hit for the same key.
  if (cached !== undefined) return { ...cached };

  const style = resolveStyleUncached(classString, pressed, colorScheme, width, themeJson);
  if (resolveStyleCache.size >= RESOLVE_STYLE_CACHE_MAX) resolveStyleCache.clear();
  resolveStyleCache.set(cacheKey, style);
  return { ...style };
}

function resolveStyleUncached(classString: string, pressed: boolean, colorScheme: string, width: number, themeJson: string): StyleObject {
  const KbachModule = TurboModuleRegistry.get<Spec>('KbachModule');
  if (!KbachModule) {
    const { style, warnings } = resolveStyleJsWithWarnings(classString, getTheme(), colorScheme, pressed, width);
    warnIfDev(classString, warnings);
    return style;
  }
  const json = KbachModule.resolveStyle(classString, themeJson, colorScheme, pressed, width);
  const style = JSON.parse(json) as StyleObject & { __kbachWarnings?: string[] };
  const warnings = style.__kbachWarnings;
  if (warnings !== undefined) {
    delete style.__kbachWarnings;
    warnIfDev(classString, warnings);
  }
  return style;
}

// De-duplicates by the exact warning text, not just per-call — a resolve
// this reactive (dark:/breakpoint/dynamic-token elements can all re-resolve
// on every relevant change, see jsxRuntimeCore.ts) would otherwise spam the
// SAME "invalid value"/"typo" message on every re-render of a
// still-broken className, forever. NOT cross-bundle-shared the way
// theme.ts/darkModeStore.ts/dynamicTokens.ts are (see tsup.config.ts) —
// nativeBridge.ts isn't externalized, so index.js and jsx-runtime.js each
// get their own copy of this Set. Harmless: the worst case is the exact
// same message printing twice (once per entry) instead of once, never a
// correctness issue, so not worth the extra externalized-entry complexity
// just for de-dup cosmetics.
const warnedMessages = new Set<string>();

function warnIfDev(classString: string, warnings: string[]): void {
  if (warnings.length === 0) return;
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return;
  for (const warning of warnings) {
    // The offending className on its own trailing line — same "one fact
    // per line" scan-ability the warning text itself already uses (see
    // rn_style_value/rnStyleValue's own doc comment), rather than a
    // trailing parenthetical tacked onto a full paragraph.
    const message = `${warning}\nFrom className: "${classString}"`;
    if (warnedMessages.has(message)) continue;
    warnedMessages.add(message);
    console.warn(message);
  }
}
