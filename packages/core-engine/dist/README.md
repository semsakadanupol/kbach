# @kbach/core-engine

The Rust/WASM utility-resolution engine that powers
[`@kbach/react`](https://www.npmjs.com/package/@kbach/react).

> **Beta.** This package is an internal dependency of `@kbach/react` (the
> web package — this build is the browser/Node WASM target). If you're
> building a React web app, install `@kbach/react` instead — it re-exports
> everything you need and pulls this package in automatically.
> `@kbach/react-native` does NOT depend on this package directly, on
> either of the two platforms it supports: on Android the same Rust source
> (`src/jni_bridge.rs`) is instead cross-compiled ahead of time to a native
> `.so` (JNI, not WASM) and shipped prebuilt inside `@kbach/react-native`'s
> own `android/` folder — see `scripts/build-android.mjs` in this package
> for how that binary gets (re)generated. On Expo Web / react-native-web,
> `@kbach/react-native` vendors a trimmed copy of this package's own
> web-target WASM glue directly into its own source (generated via
> `scripts/generate-web-glue.mjs` and `scripts/generate-wasm-base64.mjs`)
> rather than importing this package at runtime — see that script's own
> doc comment for why (short version: this package's unused async `init()`
> export references `import.meta.url`, which breaks under some bundler
> targets even when never called).

## What this is

Given a class string (e.g. `"flex items-center bg-blue-6"`) and a theme
definition, this package resolves it to real CSS rules — the same logic runs
both at build time (Node target, used by the Vite plugin to generate a
static `kbach.css`) and at runtime in the browser (web target, used for
dynamic/runtime class resolution), so the two can never disagree about what
a class name means.

Two builds are published:

- `@kbach/core-engine` — the browser (`--target web`) build, async `init()`.
- `@kbach/core-engine/node` — the Node.js (`--target nodejs`) build, used by
  build tooling; synchronous, no `init()` required.

## License

MIT
