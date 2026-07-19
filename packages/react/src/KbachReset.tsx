import { BASE_RESET, RESET_STYLE_ID, isNative } from './core';

/**
 * Renders Kbach's base browser-default reset (borderless button/input,
 * visible checkbox/radio, no arrow-less <select>, etc.) as a plain <style>
 * tag so it's part of the page's initial HTML.
 *
 * Runtime-only setups (no Vite plugin / static kbach.css) otherwise only get
 * this reset once ThemeProvider's client-side effect runs — fine for a plain
 * CSR app, but under SSR the server has no JS to run it, so the first paint
 * ships with raw browser defaults (e.g. the native button border) until
 * hydration catches up. Render this once, as high in <head> as your
 * framework allows, to close that gap.
 *
 * Not needed if you're on the static-CSS setup — kbach.css already includes
 * the same reset, and the runtime injector detects this tag and skips adding
 * it a second time either way.
 */
export function KbachReset() {
  // @kbach/native re-exports everything from this package's index — a plain
  // DOM <style> tag has no React Native host component and would crash there,
  // so this quietly renders nothing on that platform. Checked with isNative,
  // NOT isWeb: isWeb is false during Node SSR too (no `window` there), and
  // SSR is the main reason this component exists — it must still render then.
  if (isNative) return null;
  return <style id={RESET_STYLE_ID}>{BASE_RESET}</style>;
}
