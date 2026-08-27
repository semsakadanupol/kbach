import { initSync, generate_css_attr as wasmGenerateCssAttr } from './wasmGlue.generated';
import { KBACH_CORE_ENGINE_WASM_BASE64 } from './wasmBinary.generated';
import { getThemeJson } from './theme';
import { injectRule } from './cssInjector.web';

/**
 * Web sibling of nativeBridge.ts — Metro resolves `@kbach/react-native`'s
 * "browser" export condition (see this package's package.json) to
 * dist/*.web.js instead of dist/*.js when bundling for the `web` platform,
 * so jsx-runtime.tsx's `import { resolveClassName } from './nativeBridge'`
 * transparently becomes THIS file's resolveClassName for web builds — no
 * app code needs to know the difference.
 *
 * The exports map ALSO has a "node" condition pointing at the same
 * dist/*.web.js files, not just "browser" — Expo Router's static-rendering
 * (SSR) pass bundles with `resolver.environment: 'node'`, and Expo's own
 * Metro config explicitly clears `unstable_conditionsByPlatform` (which is
 * what "browser" relies on) for ANY server-environment resolution,
 * replacing it with `unstable_conditionNames: ['node']` — regardless of
 * `platform: 'web'` still being set. Without a matching "node" condition,
 * SSR silently fell through to the plain (native, TurboModuleRegistry-based)
 * build. "node" here always means "still web, just server-side" in this
 * ecosystem, so routing it to the same WASM build as "browser" is correct,
 * not a workaround.
 *
 * Genuinely different resolution strategy from nativeBridge.ts (and from
 * this file's own previous version): earlier, Expo Web reused the SAME
 * inline-style-object resolution real native uses (`resolve_style_json`),
 * gated only against `dark:`/`active:`/responsive — the three modifier
 * kinds a live JS parameter can express without a real CSS selector engine.
 * That was always a compromise specific to native's constraints (no DOM, no
 * CSS engine at all), one Expo Web never actually needed: it renders real
 * DOM via react-native-web, so it can use the exact same real-CSS engine
 * `@kbach/react` uses on the DOM — `generate_css_attr` — unlocking every
 * modifier `registry.rs` knows about (`hover:`, `focus:`, `group-hover:`,
 * `has-[...]`, container queries, ...), not just the three native manages
 * to fake with a live parameter.
 *
 * The one wrinkle: `generate_css_attr`, not `@kbach/react`'s own
 * `generate_css`. `react-native-web`'s `View`/`Text`/`Pressable` don't
 * forward an arbitrary `className` prop to the DOM at all (confirmed
 * against `forwardedProps`'s prop whitelist in react-native-web's own
 * source — `className` isn't in it) — so this can't render a literal
 * className the way `@kbach/react`'s DOM elements do. What RNW DOES
 * forward is `dataSet` (-> real `data-*` attributes), so
 * `jsxRuntimeCoreWeb.ts` renders `dataSet={{ kb: resolvedClassName }}`
 * instead, and `generate_css_attr` emits matching `[data-kb~="..."]`
 * attribute-selector rules rather than `.class` selectors — see
 * `css::SelectorMode`'s own doc comment in core-engine for the full
 * reasoning. Imports the wasm-bindgen glue from `./wasmGlue.generated` (a
 * trimmed, vendored copy this package ships itself — see
 * generate-web-glue.mjs's own doc comment) rather than from the
 * `@kbach/core-engine` package directly: the full package's unused async
 * `init()` export references `import.meta.url`, which is only valid syntax
 * inside an ES module — some bundling targets (confirmed by hand: Expo
 * Router's static-rendering/SSR bundle) load this dependency graph in a
 * context where that throws "Cannot use 'import.meta' outside a module" at
 * PARSE time, before any code even runs, even though that function is
 * never called. Vendoring a copy with that function mechanically stripped
 * sidesteps the whole class of bundler-module-format inconsistency, the
 * same way base64-embedding the .wasm binary itself already sidesteps
 * Metro's asset-pipeline inconsistency (see wasmBinary.generated.ts /
 * generate-wasm-base64.mjs).
 *
 * Initializes ITSELF eagerly, synchronously, at module load time (the
 * `initSync(...)` call below runs the instant this module is first
 * imported) — no explicit init call app code has to make. `initSync` is
 * idempotent (wasm-bindgen's own generated glue no-ops if already
 * initialized), and since embedding the WASM bytes as base64 (see
 * generate-wasm-base64.mjs) turned this into genuinely synchronous work
 * with no real async step left, there's no reason to defer it to a function
 * apps must remember to call.
 *
 * No `getGlobalDarkMode()`/`Dimensions.get('window').width`/`pressed`
 * parameters here anymore, unlike the old style-object version (and unlike
 * nativeBridge.ts, which still needs all three) — `dark:`/responsive/
 * `active:` are now real CSS (`[data-theme="dark"]`/`@media (min-width:
 * ...)`/`:active`), evaluated by the BROWSER against live state, not
 * something this function has to compute per call. This also means
 * `active:` no longer depends on RN's `Pressable` reporting its own press
 * state via a style-function callback — real `:active` fires on any DOM
 * element the browser considers "being activated," matching actual
 * Tailwind's own semantics more closely than the old simulation did.
 */
interface GenerateCssResult {
  className: string;
  rules: { rule: string; order: number }[];
}

function base64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

initSync({ module: base64ToBytes(KBACH_CORE_ENGINE_WASM_BASE64) });

// Same rationale/shape as @kbach/react's kb.ts cache and nativeBridge.ts's
// resolveStyle() cache: `processElement` (jsxRuntimeCoreWeb.ts) calls this
// for EVERY styled element on EVERY render — unlike real native, there's no
// dark:/breakpoint gate that skips most elements, since real CSS handles
// that reactivity with no re-render at all. Without caching, a component
// re-rendering for any unrelated reason still re-crosses the WASM boundary
// for every one of its styled elements, even when their className never
// changed. Bounded (cleared wholesale past RESOLVE_CLASS_NAME_CACHE_MAX)
// rather than evicted piecewise, same tradeoff as the caches above.
const RESOLVE_CLASS_NAME_CACHE_MAX = 500;
const resolveClassNameCache = new Map<string, string>();
// Reference, not content — getThemeJson() returns the SAME string instance
// until setTheme() reassigns it (see theme.ts), so comparing references is
// enough to detect "the theme changed since the cache was built" for free.
let cachedForThemeJson: string | null = null;

/**
 * Resolves `classString` to CSS via the WASM engine, injects every returned
 * rule into a shared `<style data-kbach-rn>` tag (cascade-order-safe — see
 * cssInjector.web.ts), and returns the class string to use as
 * `dataSet={{ kb: <returned value> }}`. MUST use the returned value, not the
 * original input — mode-aware color names (e.g. `bg-surface`) expand into a
 * literal light/dark pair, and the generated rules target that expanded
 * text, not the original.
 */
export function resolveClassName(classString: string): string {
  const themeJson = getThemeJson();
  if (themeJson !== cachedForThemeJson) {
    resolveClassNameCache.clear();
    cachedForThemeJson = themeJson;
  }

  const cached = resolveClassNameCache.get(classString);
  if (cached !== undefined) return cached;

  const json = wasmGenerateCssAttr(classString, themeJson);
  const { className, rules } = JSON.parse(json) as GenerateCssResult;
  for (const { rule, order } of rules) {
    injectRule(rule, order);
  }
  if (resolveClassNameCache.size >= RESOLVE_CLASS_NAME_CACHE_MAX) resolveClassNameCache.clear();
  resolveClassNameCache.set(classString, className);
  return className;
}
