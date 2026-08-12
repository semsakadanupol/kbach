import { defineConfig } from 'tsup';

export default defineConfig({
  // Named-entry form so the output filename matches each package.json
  // export subpath exactly (src/vite-plugin/index.ts would otherwise
  // produce dist/index.js by tsup's default basename convention, colliding
  // with the main entry's own index.js).
  entry: {
    index: 'src/index.ts',
    'jsx-runtime': 'src/jsx-runtime.tsx',
    'jsx-dev-runtime': 'src/jsx-dev-runtime.tsx',
    'vite-plugin': 'src/vite-plugin/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // @kbach/core-engine's WASM glue (both the browser and Node-target
  // builds) resolves its .wasm file relative to its own import.meta.url /
  // __dirname — bundling it in would break that relative lookup. Left as a
  // real dependency both consumers (this build and downstream apps)
  // resolve through node_modules. "vite" is a peer dep only the
  // vite-plugin entry actually imports (as a type-only import).
  external: ['@kbach/core-engine', '@kbach/core-engine/node', 'vite'],
});
