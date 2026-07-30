import { defineConfig } from 'tsup';

// CJS only, no dts — this is an npx-invoked bin script, not a library other
// code imports. CJS avoids ESM+shebang edge cases across package managers
// (some still trip on an ESM file with a shebang under `npx`); dts is
// pointless for something with no importable exports.
export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
