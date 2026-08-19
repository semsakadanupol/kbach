#!/usr/bin/env node
// Regenerates every generated-file target below into a temp location and
// diffs it against the committed file, failing (non-zero exit) on any
// mismatch. These files (packages/react's and packages/react-native's
// generatedPalette.ts, plus react-native's wasmBinary/wasmGlue.generated.ts)
// are produced by the generate-*.mjs scripts in this directory but are NOT
// wired into any prebuild/pretest hook — nothing previously caught a
// core-engine change landing without the downstream generated files being
// regenerated to match. Run this after building core-engine (it reads
// dist-node/, same prerequisite the generators themselves have) — see
// package.json's "verify:generated" script and .github/workflows/ci.yml.
//
// Usage: node verify-generated.mjs

import { execFileSync } from 'child_process';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(thisDir, '..', '..', '..');

const targets = [
  { generator: 'generate-palette.mjs', committed: 'packages/react/src/generatedPalette.ts' },
  { generator: 'generate-palette.mjs', committed: 'packages/react-native/src/generatedPalette.ts' },
  { generator: 'generate-wasm-base64.mjs', committed: 'packages/react-native/src/wasmBinary.generated.ts' },
  { generator: 'generate-web-glue.mjs', committed: 'packages/react-native/src/wasmGlue.generated.ts' },
];

const tmpDir = mkdtempSync(join(tmpdir(), 'kbach-verify-generated-'));
let failed = false;

try {
  for (const [index, { generator, committed }] of targets.entries()) {
    const committedPath = join(repoRoot, committed);
    // Each generator resolves its output-path arg relative to `process.cwd()`
    // (documented as "<output-path-relative-to-cwd>" in its own header, the
    // same contract packages/react's and packages/react-native's own
    // "generate:*" scripts rely on) — a plain `join(cwd, arg)`, not
    // `path.resolve`, so passing an absolute path here would get
    // double-joined onto cwd instead of replacing it. Give each target its
    // own cwd instead and pass just the basename.
    const targetDir = join(tmpDir, String(index));
    mkdirSync(targetDir, { recursive: true });
    const freshName = basename(committed);
    const freshPath = join(targetDir, freshName);

    execFileSync(process.execPath, [join(thisDir, generator), freshName], { stdio: 'inherit', cwd: targetDir });

    const committedContent = readFileSync(committedPath, 'utf-8');
    const freshContent = readFileSync(freshPath, 'utf-8');

    if (committedContent !== freshContent) {
      failed = true;
      console.error(`\n✗ ${committed} is out of date with the current core-engine build.`);
      console.error(`  Regenerate it: node packages/core-engine/scripts/${generator} ${committed}\n`);
    } else {
      console.log(`✓ ${committed} is up to date`);
    }
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

if (failed) {
  process.exit(1);
}
