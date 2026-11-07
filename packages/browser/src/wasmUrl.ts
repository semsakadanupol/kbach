const WASM_FILE = 'kbach_core_engine_bg.wasm';

// A CDN "package root" URL: the path ends at the package name, optionally
// with a version or tag (`/npm/@kbach/browser`, `/@kbach/browser@beta`).
// jsDelivr serves the `jsdelivr` field's file and unpkg redirects to the
// `unpkg` field's file, but either way the <script src> the page sees is
// still this short URL.
const PACKAGE_ROOT_RE = /(\/@kbach\/browser)(@[^/]*)?\/?$/;

/**
 * Where to fetch the `.wasm` from, given the loading `<script>`:
 *
 * 1. `data-wasm` on the script tag, when set (self-hosting the two files in
 *    different places).
 * 2. A CDN package-root URL (`https://cdn.jsdelivr.net/npm/@kbach/browser`,
 *    `…@beta`, `https://unpkg.com/@kbach/browser`): the same package at
 *    THIS build's exact `version`, under `dist/`. Plain relative resolution
 *    is wrong here: `new URL('kbach_core_engine_bg.wasm', '…/npm/@kbach/browser')`
 *    is `…/npm/@kbach/kbach_core_engine_bg.wasm`, a 404. That was the bug
 *    in 1.0.0-beta.0, where nothing got styled from the README's own
 *    URL. The exact version (not the tag from the URL) also guarantees the
 *    `.wasm` matches the JS glue that's running, even if the tag has moved
 *    on to a newer release in the CDN's cache meanwhile.
 * 3. Anything else (`…/dist/kbach.js`, a self-hosted `/js/kbach.js`): the
 *    file next to the script.
 * 4. No script src at all (inlined): next to the page.
 */
export function resolveWasmUrl(scriptSrc: string | undefined, dataWasm: string | undefined, baseURI: string, version: string): string {
  if (dataWasm) return new URL(dataWasm, baseURI).href;
  if (!scriptSrc) return new URL(WASM_FILE, baseURI).href;

  const src = new URL(scriptSrc, baseURI);
  if (PACKAGE_ROOT_RE.test(src.pathname)) {
    src.pathname = src.pathname.replace(PACKAGE_ROOT_RE, `$1@${version}/dist/${WASM_FILE}`);
    src.search = '';
    src.hash = '';
    return src.href;
  }
  return new URL(WASM_FILE, src).href;
}
