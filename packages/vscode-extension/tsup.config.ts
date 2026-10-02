import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { extension: 'src/extension.ts' },
  format: ['cjs'],
  platform: 'node',
  dts: false,
  clean: true,
  // "vscode" is a virtual module the extension host injects at runtime —
  // never a real package to bundle. @kbach/core-engine's Node-target WASM
  // glue resolves its .wasm file relative to its own __dirname (see that
  // package's own build script comment) — bundling it in would break that
  // relative lookup, same reason @kbach/react's tsup config externals it
  // instead of inlining it.
  external: ['vscode', '@kbach/core-engine', '@kbach/core-engine/node'],
});
