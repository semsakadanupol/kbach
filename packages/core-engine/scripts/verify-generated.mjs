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

import { execFileSync, spawnSync } from 'child_process';
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

// --- Android .so drift check --------------------------------------------
// The prebuilt JNI binaries below have no text/generator counterpart above
// (they're what previously went stale for days relative to resolve_style.rs
// with nothing catching it — see build-android-if-available.mjs's own doc
// comment). Best-effort: rebuilds them into a temp dir with cargo-ndk and
// byte-compares against what's committed. A machine without the NDK/
// cargo-ndk (this repo's own CI today, which has no Android toolchain set
// up) can't run this check at all — it skips with a warning rather than
// failing, same philosophy as build-android-if-available.mjs. On any
// machine that DOES have the toolchain, this now actually catches drift
// instead of relying on remembering to run `npm run build:android` by hand.
const soTargets = [
  { ndkTarget: 'arm64-v8a', committed: 'packages/react-native/android/src/main/jniLibs/arm64-v8a/libkbach_core_engine.so' },
  { ndkTarget: 'x86_64', committed: 'packages/react-native/android/src/main/jniLibs/x86_64/libkbach_core_engine.so' },
];

const soTmpDir = join(tmpDir, 'android-so');
mkdirSync(soTmpDir, { recursive: true });
const coreEngineDir = join(repoRoot, 'packages', 'core-engine');
const ndkArgs = ['ndk', ...soTargets.flatMap(({ ndkTarget }) => ['-t', ndkTarget]), '-o', soTmpDir, 'build', '--release', '--lib'];
const ndkResult = spawnSync('cargo', ndkArgs, { cwd: coreEngineDir, stdio: 'pipe' });

if (ndkResult.status !== 0) {
  console.warn(
    '\n⚠ Skipping Android .so drift check — cargo-ndk/the Android NDK isn\'t available in ' +
      'this environment. Run `npm run build:android -w @kbach/core-engine` on a machine with ' +
      'the toolchain (`cargo install cargo-ndk`, ANDROID_NDK_HOME, and the ' +
      'aarch64-linux-android/x86_64-linux-android Rust targets) to verify by hand.\n',
  );
} else {
  for (const { ndkTarget, committed } of soTargets) {
    const committedPath = join(repoRoot, committed);
    const freshPath = join(soTmpDir, ndkTarget, 'libkbach_core_engine.so');
    const committedBytes = readFileSync(committedPath);
    const freshBytes = readFileSync(freshPath);

    if (!committedBytes.equals(freshBytes)) {
      failed = true;
      console.error(`\n✗ ${committed} is out of date with the current core-engine source.`);
      console.error(`  Regenerate it: npm run build:android -w @kbach/core-engine\n`);
    } else {
      console.log(`✓ ${committed} is up to date`);
    }
  }
}

if (failed) {
  process.exit(1);
}
