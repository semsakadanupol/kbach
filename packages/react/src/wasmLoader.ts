import init, { generate_css as wasmGenerateCss } from '@kbach/core-engine';

let readyPromise: Promise<void> | null = null;
let ready = false;

/**
 * Loads and instantiates the Rust/WASM core engine. Call once at startup
 * (e.g. before `ReactDOM.createRoot(...).render(...)`) and await it — every
 * subsequent call returns the same memoized promise, so it's safe to call
 * again from multiple entry points.
 */
export function initKbach(): Promise<void> {
  return initKbachFrom(undefined);
}

/**
 * `initKbach()` with an explicit location for the `.wasm` binary — internal,
 * NOT re-exported from index.ts. `@kbach/browser` (packages/browser, the
 * CDN `<script>` build, which bundles this file from source) needs it: as a
 * classic `<script>` it has no `import.meta.url` for wasm-bindgen's default
 * lookup to resolve against, so it passes a URL next to its own script
 * instead. Renaming or removing it breaks that package's build and tests. `undefined` = wasm-bindgen's default (`import.meta.url`-relative),
 * which is exactly what `initKbach()` has always done. Shares the same
 * memoized promise, so whichever caller runs first wins.
 */
export function initKbachFrom(wasmSource: string | URL | undefined): Promise<void> {
  if (!readyPromise) {
    readyPromise = (wasmSource === undefined ? init() : init({ module_or_path: wasmSource })).then(() => {
      ready = true;
    });
  }
  return readyPromise;
}

export function isKbachReady(): boolean {
  return ready;
}

/**
 * Thin wrapper over the WASM module's `generate_css`. Throws a specific,
 * actionable error if called before `initKbach()` has resolved — the
 * async-init boundary WASM introduces has no equivalent in a fully
 * synchronous resolver, so a loud failure here beats a silent no-op.
 */
export function generateCss(classString: string, themeJson: string): string {
  if (!ready) {
    throw new Error(
      '[Kbach] generateCss() was called before initKbach() resolved. ' +
        'Call `await initKbach()` once at startup (e.g. before rendering your app) ' +
        'before using kb().',
    );
  }
  return wasmGenerateCss(classString, themeJson);
}
