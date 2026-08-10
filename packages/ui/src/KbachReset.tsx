import { BASE_RESET, RESET_STYLE_ID, isNative, isRuntimeCSSDisabled } from './core';

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
 * Skips rendering entirely once disableRuntimeCSS() has fired — the Vite
 * plugin calls it automatically wherever kbach.css gets imported (see
 * vite-plugin.ts's transform hook), and that static file already inlines
 * this exact reset. Previously this rendered unconditionally regardless of
 * that flag, so an app using the static-CSS setup that ALSO keeps
 * <KbachReset/> mounted (e.g. copied from a starter template's root layout
 * and never revisited) got the same reset rules twice — once from the
 * static file, once from this tag — on every single page load, real static
 * CSS or not. Checked here (render time), not just documented, so the
 * static setup is actually leak-free even when this stays in the tree.
 */
export function KbachReset() {
  // @kbach/native re-exports everything from this package's index — a plain
  // DOM <style> tag has no React Native host component and would crash there,
  // so this quietly renders nothing on that platform. Checked with isNative,
  // NOT isWeb: isWeb is false during Node SSR too (no `window` there), and
  // SSR is the main reason this component exists — it must still render then.
  if (isNative) return null;
  if (isRuntimeCSSDisabled()) return null;
  return <style id={RESET_STYLE_ID}>{BASE_RESET}</style>;
}
