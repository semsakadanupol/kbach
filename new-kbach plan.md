# Architecture Documentation

This document outlines the architectural patterns, polyglot technology stack, and build pipelines of this library.

Our core philosophy is **Polyglot Engineering**: we use the language best suited to each specific use-case — Rust for raw runtime/parsing performance, TypeScript for developer experience (DX), and JavaScript for testing/debugging flexibility.

---

## 🏗️ System Architecture Overview

The library is organized as a **Turbo Monorepo** separating the cross-platform core engine from the framework-specific UI wrappers.

```
┌────────────────────────────────────────────────────────┐
│ Developer-Facing API / Types          ──► TypeScript    │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ Cross-Platform Core Engine (Parser)   ──► Rust           │
│   • Web / Expo Web  → compiled to WASM                  │
│   • Native (Android) → compiled to a JNI bridge, called  │
│     from a Kotlin TurboModule (no C++/JSI layer)         │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ Bundling / Monorepo Orchestration                        │
│   • tsup (esbuild) bundles each TS package's own dist/   │
│   • Turborepo (Rust) orders and caches the task graph     │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────┐
│ Testing / Test Runner / Debugging     ──► Vitest (Node)  │
└────────────────────────────────────────────────────────┘
```

## ⚙️ Polyglot Technology Matrix

We do not force one language to do everything. Each layer of our stack is optimized for its exact operational constraints:

| Operational Layer              | Language       | Technology Used                          | Why This Language?                                                                                                   |
| :------------------------------ | :------------- | :---------------------------------------- | :---------------------------------------------------------------------------------------------------------------------- |
| **End-User API & DX**           | **TypeScript** | Strict TS + TSDoc                        | Provides autocompletion, type safety, and inline documentation inside consumer IDEs.                                    |
| **Core Parser / Style Engine**  | **Rust**       | Custom parser, `wasm-bindgen`, `jni`     | Maximum execution speed, memory efficiency, and no GC pauses when evaluating `className` strings.                       |
| **Bundling & Compiling**        | **TypeScript** | `tsup` (esbuild under the hood)          | esbuild is a stock dependency of `tsup`/Vite — not custom-authored tooling in this repo, just a fast off-the-shelf compiler. |
| **Monorepo Orchestration**      | **Rust**       | Turborepo (Turbo)                        | Project-wide task-graph analysis and local/remote caching.                                                               |
| **Testing & Debugging**         | **JavaScript** | Vitest + Node.js, `cargo test` for Rust  | Fast, Node-native debugging for TS; Rust's own test harness for the core engine.                                         |

> There is no Go or C++ anywhere in this repo (verified — no `.go`/`go.mod`, no custom `.cpp`/JSI code). Earlier drafts of this document described esbuild as a deliberate "Go" architectural layer and the native mobile bridge as "C++ JSI" — both were aspirational/inaccurate descriptions of dependencies this repo merely *uses* (esbuild, via tsup) or never actually built (a JSI bridge). The real mobile bridge is a plain **JNI** module (`packages/core-engine/src/jni_bridge.rs`, Android-only) called from a Kotlin `TurboModule`.

---

## 📦 Directory Structure (`packages/` & `apps/`)

```
├── .turbo/               # Monorepo cache directory
├── apps/                 # Sandbox / integration-testing environments
│   ├── web-sandbox/      # Vite + React web testing app (npm workspace member)
│   ├── native-sandbox/   # React Native CLI + Metro mobile testing app
│   └── expo-sandbox/     # Expo (Expo Go / dev client / Expo Web) testing app
├── packages/              # Core library workspaces
│   ├── core-engine/      # Rust: core style compiler & token parser
│   │                     #   (wasm-bindgen for Web, jni for Android)
│   ├── react/             # TypeScript: web bindings, bundled via tsup
│   └── react-native/      # TypeScript: mobile bindings, bundled via tsup
│                          #   (ships a Babel plugin for CONSUMING apps to
│                          #   add to their own babel.config.js — Babel is
│                          #   not used to build this package itself)
├── turbo.json             # Monorepo build pipeline configuration
└── package.json           # Workspace topology (excludes native-sandbox and
                            # expo-sandbox — see their own metro.config.js
                            # doc comments for why: npm-workspace hoisting
                            # breaks RN/Gradle tooling for those two apps)
```

## 🔄 Data Flow & Compilation Lifecycle

### 1. Development & Compilation

- **Turborepo (Rust)** hashes project state. If files are unchanged, it serves targets straight from local/remote caches.
- **tsup** (an esbuild-based bundler) compiles each TypeScript package's own `src/` into its published `dist/` (ESM + CJS + `.d.ts`) — this is what "bundling" means for `packages/react` and `packages/react-native` themselves.
- **Babel** is not part of building either package. `packages/react-native` ships `src/babel-plugin.js` as a *consumer-facing* artifact — an app using this package adds it to their own `babel.config.js` so Metro can process `className` at their build time; it plays no role in building the npm package itself.

### 2. Runtime Interception (The `className` Solution)

To allow end-users to declare `className` strings directly on mobile devices without crashing the layout threads:

1. The **Rust Core Engine** parses tokens and layout structures — shared resolution logic reused verbatim across every platform entry point (`resolve_class_string` in `lib.rs`).
2. For Web targets (including Expo Web), this compiles into real CSS via the WASM build.
3. For native Android targets, the same engine is compiled with a **JNI** bridge (`jni_bridge.rs`) and exposed to a Kotlin `TurboModule`, which returns a JSON-serializable style object mapped onto RN's `StyleSheet`-shaped props. There is no C++/JSI layer — JNI is the entire native bridge. iOS has no native bridge yet (Android-only, per the beta scope).
4. In Expo Go (which can't load any custom native module), a pure-JS reimplementation of the same resolution logic (`packages/react-native/src/jsEngine/`) is used as a fallback instead — a documented, intentional parity subset, not a bug.

---

## 🧪 Testing and Debugging Strategy

To guarantee stability across diverse runtimes without hurting developer velocity, our pipeline executes in distinct isolated loops:

### Rust Core Engine

- **Tool:** `cargo test` (inline `#[cfg(test)]` modules per file).
- Covers parser edge cases, every resolver, and both platform output shapes (CSS-text and the native JSON style object) end-to-end.

### TypeScript Packages (Pure Logic & Component Behavior)

- **Tool:** `Vitest` running on Node.js.
- **Rationale:** fast, and integrates natively with Chrome DevTools / VS Code / Cursor for step-through debugging.
- Component-level tests render through `react-test-renderer` (`packages/react-native`) or jsdom (`packages/react`) rather than a full device/browser, since the goal is verifying resolution and reactivity logic, not pixel output.

---

## 🛠️ Contributor Workflow Commands

Run all pipelines simultaneously utilizing optimized Turbo workspace caching:

```bash
# Install all workspace dependencies
npm install

# Run type-checks, test suites, and builds across all workspaces (Rust
# core-engine must build first — see .github/workflows/ci.yml for the full
# Rust toolchain setup a fresh machine needs, e.g. `rustup target add
# wasm32-unknown-unknown` and `wasm-pack`)
npx turbo run lint test build
```

`apps/native-sandbox` and `apps/expo-sandbox` are excluded from npm workspaces and need their own `npm install` run from inside each directory, plus an Android/Java toolchain for native builds — see each app's own `metro.config.js` doc comment for why.
