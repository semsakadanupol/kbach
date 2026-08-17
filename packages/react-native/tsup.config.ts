import { defineConfig } from 'tsup';

export default defineConfig({
  // Every entry here that has a `.web` counterpart MUST produce a
  // correspondingly-named dist file (e.g. jsx-runtime -> dist/jsx-runtime.js,
  // 'jsx-runtime.web' -> dist/jsx-runtime.web.js) — this is what Metro's
  // platform-extension resolution actually swaps between at the app's own
  // bundle time. A single source file with an internal Platform.OS branch
  // does NOT work here: tsup/esbuild flattens `./nativeBridge` at THIS
  // build's own resolve time (plain Node resolution, no notion of RN's
  // `.web.ts` convention at all), permanently baking in whichever
  // implementation the source imported — see jsx-runtime.tsx's doc comment
  // for the exact crash this caused before the entries were split.
  entry: {
    index: 'src/index.ts',
    'index.web': 'src/index.web.ts',
    'jsx-runtime': 'src/jsx-runtime.tsx',
    'jsx-runtime.web': 'src/jsx-runtime.web.tsx',
    'jsx-dev-runtime': 'src/jsx-dev-runtime.tsx',
    'jsx-dev-runtime.web': 'src/jsx-dev-runtime.web.tsx',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // react-native is resolved by the consuming app's own Metro bundler, not
  // bundled in here. babel-plugin.js ships as raw, unbuilt CommonJS (see its
  // own file header for why) and isn't part of this tsup build at all.
  //
  // No @kbach/core-engine external entry — the *.web entries import a
  // trimmed, vendored copy of its glue (src/wasmGlue.generated.ts) instead
  // of the package itself, specifically so it gets bundled inline like any
  // other own-source file rather than resolved as a separate package whose
  // module-format assumptions this build doesn't control — see
  // nativeBridge.web.ts's doc comment for the bundler incompatibility
  // (`import.meta` outside a module, under Expo Router's static-rendering
  // SSR bundle) that caused.
  external: ['react-native'],
});
