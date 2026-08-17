import { BASE_RESET, RESET_STYLE_ID } from './reset';
import { isRuntimeCSSDisabled } from './kb';

/**
 * Renders Kbach's base browser-default reset (borderless button/input,
 * visible checkbox/radio, no arrow-less <select>, etc.) as a plain <style>
 * tag so it's part of the page's initial HTML.
 *
 * Runtime-only setups (no Vite plugin / static kbach.css) otherwise only get
 * this reset once kb()'s first call injects it — fine for a plain CSR app,
 * but under SSR the server has no JS to run it, so the first paint ships
 * with raw browser defaults (e.g. the native button border) until
 * hydration catches up. Render this once, as high in <head> as your
 * framework allows, to close that gap.
 *
 * Skips rendering entirely once disableRuntimeCSS() has fired — the Vite
 * plugin calls it automatically wherever kbach.css gets imported (see
 * vite-plugin/format.ts's own BASE_RESET inlining), and that static file
 * already has this exact reset. No isNative check (unlike old-kbach's
 * version of this component): @kbach/react is a web-only package now, so
 * there's no cross-platform import path for this component to guard against.
 */
export function KbachReset() {
  if (isRuntimeCSSDisabled()) return null;
  return <style id={RESET_STYLE_ID}>{BASE_RESET}</style>;
}
