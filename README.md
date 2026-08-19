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

Each package's own README has install and usage instructions — this file
only indexes them; see [`new-kbach plan.md`](new-kbach%20plan.md) for the
cross-package architecture.

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

## License

MIT
