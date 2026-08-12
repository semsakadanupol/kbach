import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'jsx-runtime': 'src/jsx-runtime.tsx',
    'jsx-dev-runtime': 'src/jsx-dev-runtime.tsx',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // react-native is resolved by the consuming app's own Metro bundler, not
  // bundled in here. babel-plugin.js ships as raw, unbuilt CommonJS (see its
  // own file header for why) and isn't part of this tsup build at all.
  external: ['react-native'],
});
