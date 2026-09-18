import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['cjs'],
  platform: 'node',
  dts: false,
  clean: true,
  // Every consumer of this package runs it via `npx`/`bin`, never `import`s
  // it as a library — a single executable CJS file is the right shape, not
  // the dual ESM/CJS + .d.ts split the other packages use as libraries.
  banner: { js: '#!/usr/bin/env node' },
  noExternal: ['@clack/prompts', 'recast', '@babel/parser'],
});
