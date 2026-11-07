#!/usr/bin/env node
// Copies @kbach/core-engine's web-target .wasm next to the bundle
// (dist/kbach.js), where src/index.ts fetches it from by default. Part of
// the "build" script, after tsup.
//
// Resolves @kbach/core-engine FROM @kbach/react's wasmLoader.ts, not from
// this package. That file is where the bundled `import ... from
// '@kbach/core-engine'` lives, so esbuild bundles the glue resolved from
// there. Resolving the .wasm the same way guarantees the glue and the binary
// always come from the same copy, and a mismatched pair fails at load time.
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const fromReact = createRequire(join(pkgDir, '..', 'react', 'src', 'wasmLoader.ts'));
const source = join(dirname(fromReact.resolve('@kbach/core-engine')), 'kbach_core_engine_bg.wasm');
if (!existsSync(source)) {
  console.error(`copy-wasm: ${source} not found. Build or install @kbach/core-engine first.`);
  process.exit(1);
}
const outDir = join(pkgDir, 'dist');
mkdirSync(outDir, { recursive: true });
copyFileSync(source, join(outDir, 'kbach_core_engine_bg.wasm'));
console.log(`Copied the WASM engine (${source}) into ${outDir}`);
