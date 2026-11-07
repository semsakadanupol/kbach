import type { KbachConfig } from '../../react/src/config';
import { startKbachCdn, type KbachCdnApi } from './runtime';

/**
 * Entry point of @kbach/browser (`dist/kbach.js`, an IIFE for a classic
 * `<script src>` tag with no bundler and no React):
 *
 *   <script>window.kbachConfig = { extend: { colors: { brand: '#ff6b35' } } }</script>
 *   <script src="https://cdn.jsdelivr.net/npm/@kbach/browser"></script>
 *
 * The `.wasm` engine is fetched from next to this script
 * (`document.currentScript.src`), since there's no `import.meta.url` here.
 * Override it with `<script src="…" data-wasm="/path/to/kbach_core_engine_bg.wasm">`
 * when self-hosting the two files in different places.
 */
declare global {
  interface Window {
    kbachConfig?: KbachConfig;
    Kbach?: KbachCdnApi;
  }
}

const script = document.currentScript as HTMLScriptElement | null;
const wasmUrl = script?.dataset.wasm ?? new URL('kbach_core_engine_bg.wasm', script?.src || document.baseURI);

window.Kbach = startKbachCdn({ document, wasmUrl, config: window.kbachConfig });
