#!/usr/bin/env node
// Best-effort wrapper around build-android.mjs, run as the LAST step of the
// main "build" script — see this repo's own history for exactly why this
// exists: the Android .so files are prebuilt binaries committed into
// @kbach/react-native's own package (not built from source at a consumer's
// Gradle time — see build-android.mjs's own doc comment), and they went
// stale relative to Rust source for days because rebuilding them was a
// SEPARATE, easy-to-forget manual command. A calc()/warnings/typo-detection
// feature shipped fully wired up in JS/TS while the actual compiled native
// binary a real device/CLI build calls into was still running old code —
// no error, no test failure, just silently wrong behavior only a real
// device build would ever surface.
//
// Folding this into `npm run build` means anyone with the Android NDK +
// cargo-ndk installed (this repo's own primary dev environment included)
// gets the Android rebuild automatically, every time, with no separate step
// to remember. Machines WITHOUT that toolchain (CI included — no NDK setup
// there today, see .github/workflows/ci.yml) still need it to be optional —
// this exits 0 with a clear warning on ANY failure instead of failing the
// whole build, rather than making Android tooling a hard requirement for
// every core-engine change.
//
// Deliberately does NOT pre-check with a separate `cargo ndk --version`
// probe before attempting the real build: that probe only proves the
// cargo-ndk SUBCOMMAND exists, not that the NDK itself is actually
// locatable — confirmed by hand, this environment's own interactive shell
// resolves the NDK fine (ANDROID_HOME is set), but a turbo-spawned child
// process does NOT inherit that the same way, so the probe passed while
// the real build still failed with "Could not find any NDK." Attempting
// the actual build and catching ITS failure is the only check that can't
// be fooled by an environment/subprocess mismatch like that.
import { spawnSync } from 'child_process';

const result = spawnSync('node', ['scripts/build-android.mjs'], { stdio: 'inherit' });
if (result.status !== 0) {
  console.warn(
    '\n⚠ Skipping Android .so rebuild (see the error above) — likely missing ' +
      'cargo-ndk (`cargo install cargo-ndk`), the Android NDK ' +
      '(set ANDROID_NDK_HOME), or the Android Rust targets ' +
      '(`rustup target add aarch64-linux-android x86_64-linux-android`).\n' +
      '  packages/react-native/android/src/main/jniLibs/*.so will NOT reflect ' +
      'this change until you run `npm run build:android` on a machine where ' +
      'that build actually succeeds — a real native/CLI build will otherwise ' +
      'silently run stale code with no error.\n',
  );
}
process.exit(0);
