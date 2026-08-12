markdown# Architecture Documentation

This document outlines the architectural patterns, polyglot technology stack, and build pipelines of this library.

Our core philosophy is **Polyglot Engineering**: we use the absolute best programming language for each specific use-case—prioritizing Rust for raw runtime/parsing performance, Go for compilation speeds, TypeScript for developer experience (DX), and JavaScript for debugging flexibility.

---

## 🏗️ System Architecture Overview

The library is organized as a high-performance **Turbo Monorepo** separating the cross-platform core engine from the framework-specific UI wrappers.

## ┌────────────────────────────────────────────────────────┐│ Developer-Facing API / Types │ ──► TypeScript (TSDoc)└────────────────────────────────────────────────────────┘│▼┌────────────────────────────────────────────────────────┐│ Cross-Platform Core Engine (Parser & Layout) │ ──► Rust (WASM / C++ JSI)└────────────────────────────────────────────────────────┘│▼┌────────────────────────────────────────────────────────┐│ Bundling / Build Pipeline / Cache Routing │ ──► Go (Esbuild) / Rust (Turbo)└────────────────────────────────────────────────────────┘│▼┌────────────────────────────────────────────────────────┐│ Testing / Test Runner / Debugging │ ──► JavaScript (Vitest / Node)└────────────────────────────────────────────────────────┘

## ⚙️ Polyglot Technology Matrix

We do not force one language to do everything. Each layer of our stack is optimized for its exact operational constraints:

| Operational Layer              | Language       | Technology Used      | Why This Language?                                                                                                               |
| :----------------------------- | :------------- | :------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **End-User API & DX**          | **TypeScript** | Strict TS + TSDoc    | Provides autocompletion, type safety, and inline documentation inside consumer IDEs.                                             |
| **Core Parser / Style Engine** | **Rust**       | Custom Parser / WASM | Maximum execution speed, memory efficiency, and zero garbage collection pauses when evaluating `className` strings.              |
| **Bundling & Compiling**       | **Go**         | Esbuild (via Vite)   | Native, multi-threaded binary compilation that executes up to 100x faster than traditional Babel setups.                         |
| **Monorepo Orchestration**     | **Rust**       | Turborepo (Turbo)    | Instantaneous project-wide graph analysis and global caching strategies.                                                         |
| **Testing & Debugging**        | **JavaScript** | Vitest + Node.js     | Best-in-class debugging ecosystem. Integrates natively with Chrome DevTools and displays actionable human-readable stack traces. |

---

## 📦 Directory Structure (`packages/` & `apps/`)

## ├── .turbo/ # Monorepo cache directory├── apps/ # Sandbox / E2E Integration Testing environments│ ├── web-sandbox/ # Vite + React web testing application│ └── native-sandbox/ # Metro + React Native mobile testing application├── packages/ # Core library workspaces│ ├── core-engine/ # RUST: Core style compiler & token parser│ ├── react/ # TYPESCRIPT: Web components (Bundled via Vite + Esbuild)│ └── react-native/ # TYPESCRIPT: Mobile components (Bundled via Babel/Metro proxy)├── turbo.json # Monorepo build pipeline configurations└── package.json # Global dependency topology

## 🔄 Data Flow & Compilation Lifecycle

### 1. Development & Compilation (Go & Rust)

- **Turborepo (Rust)** hashes project state. If files are unchanged, it serves targets straight from local/remote caches.
- When code changes, **Esbuild (Go)** compiles the TypeScript code down to production-ready ES Modules (ESM) for Web targets, bypassing slow Babel configurations entirely.
- **Babel** is strictly sandboxed _only_ within the `react-native` workspace to interface smoothly with mobile native Metro bundler constraints.

### 2. Runtime Interception (The `className` Solution)

To allow end-users to declare `className` strings directly on mobile devices without crashing the layout threads:

1. The **Rust Core Engine** parses tokens and layout structures.
2. For Web targets, this compiles into ultra-lightweight optimized CSS lookups.
3. For Mobile targets, the parser outputs optimized JSON primitives that map directly into native React Native `StyleSheet` objects at the C++ JSI layer.

---

## 🧪 Testing and Debugging Strategy

To guarantee stability across diverse runtimes without hurting developer velocity, our pipeline executes in distinct isolated loops:

### Pure Logic & Shared Hooks (Speed & Precision)

- **Tool:** `Vitest` running on Node.js (**JavaScript**).
- **Rationale:** Provides unmatched hot-reloading speed and direct step-through debugging interfaces inside VS Code / Cursor.

### Visual & Integration Verification (Simulated Environments)

- **Web UI Components:** Tested via `@testing-library/react` inside simulated browser DOMs.
- **React Native Components:** Tested via `@testing-library/react-native` to ensure no prohibited web elements (`<div>`, `<span>`) accidentally leak into mobile production bundles.

---

## 🛠️ Contributor Workflow Commands

Run all pipelines simultaneously utilizing optimized Turbo workspace caching:

```bash
# Install all workspace dependencies
npm install

# Run type-checks, linters, and test suites across all packages concurrently
npx turbo run lint test

# Build all packages (Rust WASM, Web ESM modules, and Mobile bundles)
npx turbo run build
```
