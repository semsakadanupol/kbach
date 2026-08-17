#!/usr/bin/env node
// Builds the JNI bridge (src/jni_bridge.rs) for Android and drops the
// resulting .so files straight into @kbach/react-native's own jniLibs —
// its android/ folder ships them directly (a separate @kbach/android
// package used to exist for this; folded into @kbach/react-native itself
// so consumers only ever run one `npm install`, see that package's
// KbachModule.kt doc comment). Without this script the prebuilt binaries
// have no documented, repeatable way to get regenerated, which is exactly
// how they went stale relative to the Rust source in the first place
// (resolve_style.rs/resolvers/* gained a batch of new resolvers and bug
// fixes that the committed .so predates).
//
// Requires cargo-ndk (`cargo install cargo-ndk`) and the Android NDK
// (ANDROID_NDK_HOME, or cargo-ndk's own ANDROID_NDK_ROOT/ANDROID_HOME
// fallbacks) plus the aarch64-linux-android/x86_64-linux-android Rust
// targets (`rustup target add aarch64-linux-android x86_64-linux-android`).
// Run manually when native/*.rs changes and you need the Android .so
// refreshed — not wired into any prebuild hook, same reasoning as
// generate-palette.mjs in this same directory: it needs toolchain that
// isn't installed everywhere this repo is worked on.
//
// Usage: node build-android.mjs

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const coreEngineDir = join(thisDir, '..');
// Matches @kbach/react-native's own jniLibs layout exactly (arm64-v8a,
// x86_64) — cargo-ndk names its per-target output directories after the -t
// labels passed below, so pointing -o directly here needs no extra copy step.
const jniLibsDir = join(thisDir, '..', '..', 'react-native', 'android', 'src', 'main', 'jniLibs');

// Only the two targets @kbach/react-native actually ships (see its
// README: arm64-v8a for real devices, x86_64 for emulators; armeabi-v7a/x86
// aren't built yet).
const targets = ['arm64-v8a', 'x86_64'];

const args = ['ndk', ...targets.flatMap((t) => ['-t', t]), '-o', jniLibsDir, 'build', '--release', '--lib'];

console.log(`Running: cargo ${args.join(' ')}`);
const result = spawnSync('cargo', args, { cwd: coreEngineDir, stdio: 'inherit' });

if (result.status !== 0) {
  console.error(
    '\nBuild failed. Common causes: cargo-ndk not installed (`cargo install cargo-ndk`), ' +
      'the Android NDK not found (set ANDROID_NDK_HOME), or the Android Rust targets not ' +
      'installed (`rustup target add aarch64-linux-android x86_64-linux-android`).',
  );
  process.exit(result.status ?? 1);
}

console.log(`\nDone — libkbach_core_engine.so refreshed under ${jniLibsDir}`);
