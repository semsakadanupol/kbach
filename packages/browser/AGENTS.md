# `@kbach/browser` — reference for AI assistants

Kbach from a CDN: one classic `<script>` for a plain HTML page, with no
bundler, no npm install and no React. This file covers `@kbach/browser`
only. For the cross-package overview, see the repo root's
[AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

```html
<script>window.kbachConfig = { darkMode: 'class', extend: { colors: { brand: '#ff6b35' } } };</script>
<script src="https://cdn.jsdelivr.net/npm/@kbach/browser"></script>
```

`https://cdn.jsdelivr.net/npm/@kbach/browser` and
`https://unpkg.com/@kbach/browser` serve `dist/kbach.js` via package.json's
`jsdelivr`/`unpkg` fields.

---

## 1. What it does

`src/index.ts` (entry) → `startKbachCdn` (`src/runtime.ts`):

1. Reads `window.kbachConfig` once (same shape as `kbach.config.js`),
   resolves it with `@kbach/react`'s `resolveKbachConfig`, and applies it
   before the engine loads, so dark-mode state and color variables are on
   `<html>` from the start.
2. Fetches `kbach_core_engine_bg.wasm` from next to its own
   `<script src>` (`document.currentScript`), or from the script's
   `data-wasm` attribute.
3. Styles every `class` token on the page through `@kbach/react`'s `kb()`,
   which injects rules into `<style data-kbach>` plus the base reset. Each
   token is resolved at most once per config (`seen` set, one batched
   `kb()` call per scan). Non-Kbach classes produce no rules.
4. Watches `<html>` with a `MutationObserver` (added nodes plus `class`
   attribute changes), started after the first full scan.
5. Exposes `window.Kbach`: `ready`, `config(cfg)` (re-resolve plus a full
   re-scan), `refresh()`, `setMode()`, `toggle()` (the last two are
   `@kbach/react`'s dark-mode store).

**Mode-aware colors are mapped to CSS variables, not expanded**
(`src/cdnTheme.ts`, `toCdnTheme`). For a `{ light, dark }` pair, the
engine rewrites `bg-surface` to `bg-[#…] dark:bg-[#…]` and generates rules
only for that text, which `kb()` callers handle by using the returned
className. A CDN script can't rewrite the page's own `class` attributes, so
each hex pair becomes `rgb(var(--kb-color-<name>))`, and
`ensureColorVariablesInjected` supplies the light/dark values for the
configured strategy. Known limit: `bg-surface/50` (opacity on a mode-aware
color) renders at full opacity.

## 2. How it's built — it bundles `@kbach/react`'s SOURCE

There is no second copy of any runtime logic here. `src/*.ts` imports
`../../react/src/{kb,theme,config,colorVariables,darkModeStore,wasmLoader}`
directly. None of those import React. They aren't public exports of
`@kbach/react`, and importing its built entry would pull in React
components. Consequences:

- `@kbach/react` is a `devDependency` (`"*"`, the workspace copy) only so
  Turbo orders and cache-keys this build after react's. It is NOT a runtime
  dependency: everything is bundled into `dist/kbach.js`.
- `wasmLoader.ts`'s `initKbachFrom(url)` is internal to `@kbach/react`
  (not exported from its index) and exists for this package. Renaming or
  removing it breaks this build, and the tests here catch that.
- **The `.wasm` and the bundled glue come from the `@kbach/core-engine`
  that `react/src/wasmLoader.ts` resolves** (react's `dependencies`
  version), never from this package. `scripts/copy-wasm.mjs` resolves the
  `.wasm` from that same file on purpose, since a mismatched glue/binary
  pair fails at load time.

`npm run build` = `tsup` (`tsup.config.ts`: IIFE, browser, minified,
`noExternal: [/.*/]`, no source map) → `scripts/copy-wasm.mjs` →
`scripts/verify-bundle.mjs`. The last step loads the BUILT
`dist/kbach.js` into jsdom with the real `.wasm` and fails the build
unless existing, added and changed classes are styled, the wasm URL is
correct, mode-aware colors use their variable, the page's `class` is
never rewritten, and `toggle()` flips `<html>`.

Tests (`npm run test`): `src/cdnTheme.test.ts` and `src/runtime.test.ts`,
which runs the real Node-target engine in place of the browser loader,
under jsdom with `@kbach/react`'s `test-setup.ts`.

Sizes (2026-11-07, gzipped): `kbach.js` ~7 KB, `.wasm` ~158 KB.

**Sandbox:** `apps/web-cdn` (`npm run dev -w web-cdn`, port 5174) is one
plain `index.html` and a dependency-free `serve.mjs`. `/` uses the LOCAL
`dist/` (rebuild with `npm run build -w @kbach/browser`, then reload), and
`/cdn` uses the published `@kbach/browser@beta` from jsDelivr. The page
covers utility classes, a config color, mode-aware colors with a toggle,
added elements and class changes. It must be served over http: `file://`
can't fetch the `.wasm`.

## 3. Common failure modes

- **Nothing is styled.** Check the network tab for the `.wasm` request. A
  404 means `kbach_core_engine_bg.wasm` isn't next to `kbach.js` (when
  self-hosting, copy both files, or set `data-wasm`). Opening the HTML as
  `file://` fails too: browsers won't `fetch()` a local file, so serve the
  folder (`npx serve`).
- **A custom color isn't applied.** `window.kbachConfig` was set AFTER
  the `<script src>` tag. It's read once at load. Set it before, or call
  `Kbach.config({...})` later.
- **`Kbach.toggle()` does nothing visible.** The default
  `darkMode: 'media'` follows the OS only. Set `darkMode: 'class'` or
  `'attribute'` in `window.kbachConfig`.
- **A brief unstyled flash on load.** Expected: classes resolve in the
  browser after the WASM loads, like Tailwind's Play CDN. Use
  `@kbach/react`'s build plugin for production.
