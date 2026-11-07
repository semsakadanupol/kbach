import type { KbachConfig } from '../../react/src/config';
import { startKbachCdn, type KbachCdnApi } from './runtime';
import { resolveWasmUrl } from './wasmUrl';

/**
 * Entry point of @kbach/browser (`dist/kbach.js`, an IIFE for a classic
 * `<script src>` tag with no bundler and no React):
 *
 *   <script>window.kbachConfig = { extend: { colors: { brand: '#ff6b35' } } }</script>
 *   <script src="https://cdn.jsdelivr.net/npm/@kbach/browser"></script>
 *
 * There's no `import.meta.url` here, so the `.wasm` location comes from
 * the script tag itself. See `resolveWasmUrl` for the rules, including
 * `data-wasm="/path/to/kbach_core_engine_bg.wasm"` for self-hosting the two
 * files in different places.
 */
declare global {
  interface Window {
    kbachConfig?: KbachConfig;
    Kbach?: KbachCdnApi;
  }
}

// Replaced at build time with package.json's version (tsup.config.ts `define`).
declare const __KBACH_BROWSER_VERSION__: string;

const script = document.currentScript as HTMLScriptElement | null;
const wasmUrl = resolveWasmUrl(script?.src || undefined, script?.dataset.wasm, document.baseURI, __KBACH_BROWSER_VERSION__);

window.Kbach = startKbachCdn({ document, wasmUrl, config: window.kbachConfig });
