# Kbach

A utility-first styling engine powered by a shared Rust/WASM core, with
separate bindings for web and React Native.

> Beta — APIs may still change before 1.0.0.

## Packages

| Package                                              | What it is                                                     |
| :---------------------------------------------------- | :--------------------------------------------------------------- |
| [`@kbach/core-engine`](packages/core-engine)         | Rust parser/style engine (WASM for web, JNI for native Android). Not published standalone — consumed by the two packages below. |
| [`@kbach/react`](packages/react)                     | Web bindings — Vite plugin, static CSS generation, React hooks.   |
| [`@kbach/react-native`](packages/react-native)       | React Native bindings — native (Android), Expo Web, and Expo Go. |

Each package's own README has a short install-and-go guide.
[`AGENTS.md`](AGENTS.md) is the full reference — how to use both packages
and how the engine works underneath; see [`new-kbach plan.md`](new-kbach%20plan.md)
for the original cross-package design notes.

## Development

```sh
npm install
npx turbo run lint test build
```

Building `packages/core-engine` requires a Rust toolchain with the
`wasm32-unknown-unknown` target and `wasm-pack` installed — see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) for the exact setup a
fresh machine needs.

`apps/native-sandbox` and `apps/expo-sandbox` are excluded from npm
workspaces (see their own `metro.config.js` doc comments for why) and need
their own `npm install` from inside each directory, plus an Android/Java
toolchain for native builds.

### ⚠️ The Android native module is a PREBUILT BINARY — it will NOT
### rebuild itself from a Rust change

`packages/react-native/android/src/main/jniLibs/{arm64-v8a,x86_64}/
libkbach_core_engine.so` are compiled binaries committed directly into the
published `@kbach/react-native` package — unlike a real Gradle-native-build
setup, they are **not** cross-compiled from Rust source at a consumer's own
build time. Changing anything in `packages/core-engine/src/` and running
the usual `npm run build` (wasm-pack, web/Node targets) does **not** touch
these files.

`packages/core-engine`'s own `npm run build` now runs `build:android` too,
automatically, as its last step — but only when `cargo-ndk` + the Android
NDK are actually available and locatable *in that exact process's
environment*. This has been observed to succeed when run directly
(`cd packages/core-engine && npm run build`) but silently fail to find the
NDK when run via `npx turbo run build` on Windows/Git Bash, even with an
otherwise-identical shell environment — a real, unresolved env-propagation
quirk, not a config oversight. When it can't run, it warns loudly instead
of either silently succeeding or failing the whole pipeline — **read the
build output**, don't assume a green build means the `.so` is current.

`turbo.json` gives `core-engine`'s `build` task its own `@kbach/core-engine#build`
override with `"cache": false`, specifically so this step can never be
skipped by a turbo cache hit — the android script's `.so` output lives
outside `dist/**` (this task's only declared output, and outside
`core-engine`'s own directory entirely), so turbo has no way to know
whether a cached build is safe with respect to that file. Without the
override, a cache hit would skip re-running the script — and its warning —
entirely, and a stale `.so` could go unnoticed even on an apparently
successful build.

If you're not sure, verify directly rather than trust the log:
```sh
grep -ao "<some string unique to your Rust change>" \
  packages/react-native/android/src/main/jniLibs/arm64-v8a/libkbach_core_engine.so
```
A real device/CLI native build failing to reflect a Rust change, with zero
errors anywhere, is exactly what a stale `.so` looks like — this already
happened once for real (calc()/warnings/typo-detection shipped fully wired
up in JS/TS while the actual compiled binary was still running days-old
code) before this safeguard existed.

## License

MIT
