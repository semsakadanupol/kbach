import { defineConfig } from 'tsup';

/**
 * ONE self-contained classic-script file, `dist/kbach.js`, for
 * `<script src="https://cdn.jsdelivr.net/npm/@kbach/browser">` (package.json's
 * `jsdelivr`/`unpkg` fields point here). IIFE, browser platform, minified,
 * with everything bundled in: @kbach/react's runtime modules (imported from
 * its src/, see AGENTS.md §2) and @kbach/core-engine's WASM glue, since a
 * plain script tag has no node_modules to resolve anything from.
 *
 * Bundling the glue is safe even though @kbach/react's tsup.config.ts
 * warns against it: the glue's own `import.meta.url` default lookup is
 * never reached, because src/index.ts always passes an explicit wasm URL.
 * scripts/copy-wasm.mjs puts the .wasm next to the bundle. No source map:
 * it would ship in the npm tarball for every installer, and debugging a
 * prototype page doesn't need one.
 */
export default defineConfig({
  entry: { kbach: 'src/index.ts' },
  outDir: 'dist',
  format: ['iife'],
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  dts: false,
  clean: true,
  noExternal: [/.*/],
  outExtension: () => ({ js: '.js' }),
});
