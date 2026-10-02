// Copies the Node-target WASM build's actual output files directly into
// this package's own dist/, alongside the bundled extension.js — see
// src/engine.ts's own doc comment for why: requiring `@kbach/core-engine`
// by package name resolves, inside this monorepo, via an npm workspace
// SYMLINK to the sibling packages/core-engine source directory, which
// doesn't exist once this extension is packaged into a standalone .vsix.
// Confirmed live: a real packaged + installed extension produced zero
// completions/hover/diagnostics before this existed.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const distNode = join(thisDir, '..', '..', 'core-engine', 'dist-node');
const outDir = join(thisDir, '..', 'dist');

mkdirSync(outDir, { recursive: true });

for (const file of ['kbach_core_engine.js', 'kbach_core_engine_bg.wasm']) {
  const src = join(distNode, file);
  if (!existsSync(src)) {
    console.error(`Missing ${src} — run "npm run build" in packages/core-engine first.`);
    process.exit(1);
  }
  copyFileSync(src, join(outDir, file));
}

console.log(`Copied the Node-target WASM engine into ${outDir}`);
