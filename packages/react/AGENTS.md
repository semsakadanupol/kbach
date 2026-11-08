# `@kbach/react` — reference for AI assistants

The web binding of [Kbach](https://github.com/semsakadanupol/kbach) — the
same Tailwind-v4-shaped class-name vocabulary as `@kbach/react-native`,
resolved at **build time** into a real CSS file via a shared Rust/WASM
core. This file covers `@kbach/react` only; for the cross-package
overview, `kbach.config.js` reference, the color palette, and how the
underlying engine is built, see the repo root's
[AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

> **Before writing a single class, know this — Tailwind familiarity
> actively misleads here:** color shades are `1`–`12` (lightest→darkest),
> not Tailwind's `50`–`950`. `bg-blue-500` is not a Kbach class — it
> silently resolves to nothing (an "Unknown class ... Typo?" dev warning,
> not a visible color, and ONLY if the string was actually reachable by
> the static scanner — see §2). The real class is `bg-blue-6`. Full
> palette: root AGENTS.md §7. Everything else in real Tailwind's utility
> vocabulary works here essentially as-is — unlike `@kbach/react-native`,
> web has the full modifier set with no native-platform gaps.

---

## 1. Install + wire up the build

```sh
npx @kbach/cli init
```

Automates everything below — installs `@kbach/react`, patches
`vite.config.ts` or `postcss.config.js` via a format-preserving codemod
(never string templating), and for the PostCSS path ensures the marker
pair exists in `globals.css`. Safe to re-run at any time (idempotent —
reports "already wired up" rather than duplicating an entry). See
[`packages/cli/AGENTS.md`](../cli/AGENTS.md) for exactly what it detects
and changes, and what it does when a codemod can't safely apply (prints
the same manual snippet shown below, rather than guessing).

The manual steps below are both the CLI's own fallback and the accurate
reference for what it actually does — start here if you're wiring this
up by hand, or the CLI reported it couldn't:

```sh
npm install @kbach/react@beta
```

**Vite:**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/react/vite';

export default defineConfig({ plugins: [kbach(), react()] });
```

**Next.js / any PostCSS bundler:**

```js
// postcss.config.js
module.exports = { plugins: { '@kbach/react/postcss': {} } };
```

```css
/* globals.css — the plugin fills between these markers */
/* kbach:start */
/* kbach:end */
```

Then import the generated CSS once from your entry point
(`import './kbach.css'` for Vite; `import './globals.css'` for PostCSS) and
write `className="..."` normally.

## 2. How resolution works

1. At build time the plugin walks your `include` dirs (`src`, `app`,
   `pages`, `components` by default), extracts every string that looks like
   a class list, and hands each to the WASM engine.
2. The engine parses each class → emits CSS rules (with the correct
   `@media` / selector wrappers for modifiers).
3. Rules are written between the `/* kbach:start */` / `/* kbach:end */`
   markers of a `kbach.css` file. The plugin finds an existing marked file
   under your source dirs or the project root, else creates one; pass
   `cssFile` to pin the path.
4. At runtime `className` is a plain string prop — **nothing calls the
   engine**, the CSS already exists. No async init.

Mode-aware colors (`surface: { light, dark }`, built in or from
`kbach.config.js`) compile to `rgb(var(--kb-color-<name>))` against the
class as written (`.bg-surface`), and kbach.css defines each variable on
`:root` plus under the dark-mode selector. `staticCss/engine.ts` gets this
by handing the engine `withColorVariables(theme)` (colorVariables.ts);
`format.ts` writes the variables with `colorVariablesCss(theme)`, the same
text `ensureColorVariablesInjected` injects at runtime. `kb()` uses the
same variable form (kb.ts `refreshEngineTheme`, 1.0.0-beta.29+) and
injects the variables, so `kb('bg-surface')` returns `bg-surface`
unchanged; only a mode-aware color whose values aren't hex still comes
back expanded (`bg-[…] dark:bg-[…]`), which is why callers must use the
string `kb()` returns.

## 3. Runtime pieces (opt-in, these DO call the engine)

- **`kb(dynamicClassString)`** — resolve a class list assembled from
  runtime data (`kb(\`bg-${color}-6\`)`). Requires `await initKbach()` once
  before first use. Prefer a `safelist: [...]` plugin entry when the
  possible values are known ahead of time (stays fully static).
  It leaves classes the static kbach.css already defines to that file
  (kb.ts `staticClasses`, found by the `--kb-dark-mode` declaration the
  plugin writes on `:root`). Before 1.0.0-beta.29 it injected them again,
  into a `<style data-kbach>` that comes later in the document, so a
  runtime `.grid` beat a static `@media (min-width: 1024px) .lg:hidden`
  on another element: responsive classes broke once `kb()` ran.
- **`@kbach/react/jsx-runtime`** — a `jsxImportSource` override that
  intercepts *every* element's `className` at runtime instead of relying on
  the static scan. Also needs `await initKbach()`.
- **No-build CDN usage is a SEPARATE package, `@kbach/browser`**
  (packages/browser), which bundles this package's runtime modules (`kb`,
  `theme`, `config`, `colorVariables`, `darkModeStore`, `wasmLoader`)
  straight from `src/`. Renaming or changing those modules' exports (or
  `wasmLoader.ts`'s internal `initKbachFrom`) breaks that package, and its
  own tests catch it. See [packages/browser/AGENTS.md](../browser/AGENTS.md).

## 4. Dark mode

`dark:` classes work through plain CSS with zero setup, following the OS
(`@media (prefers-color-scheme)`).

For a **manual toggle**, add one line to `kbach.config.js`:

```js
export default { darkMode: 'attribute' }; // or 'class'
```

Nothing else — the plugin auto-discovers the file, and the runtime reads
the strategy back out of the generated CSS. Then:

```tsx
import { useTheme } from '@kbach/react';
const { mode, isDark, toggle, setMode } = useTheme();
```

No provider needed (`useTheme` reads a global store). `<ThemeProvider
defaultMode="dark">` only seeds a startup default. Outside React:
`getGlobalDarkMode()` / `toggleGlobalDarkMode()` / `setGlobalThemeMode()`.

Pure-runtime (`kb()`-only, no build step): call `applyKbachConfig({
darkMode: 'attribute' })` yourself once before first render.

## 5. Plugin options (`KbachPluginOptions`)

`root`, `theme` (a resolved `ThemeConfig`), `config` (a `KbachConfig`, same
shape as `kbach.config.js` — see the root AGENTS.md's config reference),
`include` (dirs to scan), `safelist` (classes to always emit), `cssFile`
(explicit output path). PostCSS: `root` defaults to `process.cwd()`; pass
it if `postcss.config.js` isn't at the project root.

## 6. Exports

`initKbach`, `isKbachReady`, `kb`, `disableRuntimeCSS`,
`isRuntimeCSSDisabled`, `setTheme`, `getTheme`, `defaultTheme`,
`KbachReset`, `resolveKbachConfig`, `applyKbachConfig`, `useTheme`,
`ThemeProvider`, `useColors`, `clsx`, `getGlobalDarkMode`,
`getGlobalThemeMode`, `setGlobalThemeMode`, `toggleGlobalDarkMode`,
`subscribeGlobalDarkMode`. Types: `ThemeConfig`, `ColorEntry`,
`ContainerConfig`, `DarkModeStrategy`, `KbachConfig`, `ThemeState`,
`ThemeProviderProps`, `ThemeMode`, `ColorsAPI`, `ColorScale`, `ClassValue`.

## 7. Editing kbach.config.js

The Vite plugin watches `kbach.config.{js,mjs,cjs}` at the root: on a
change it re-reads the file, rebuilds the theme and a fresh engine,
rescans and rewrites kbach.css, with no restart (`reloadConfig` in
vite-plugin/index.ts, 1.0.0-beta.29+). A config that fails to load
mid-edit is reported and the last good theme kept. Both loaders bypass
Node's module cache (`delete require.cache[…]`; `import()` with a `?t=`
query through a runtime-built `new Function` import, which a bundler or
vitest can't rewrite). An ESM-type project's `.js` config goes straight
to `import()`: Node 22+ can `require()` an ES module, but into the ESM
cache, where clearing `require.cache` never reached it. The PostCSS
plugin re-reads the config on every run the same way, and registers it
as a postcss `dependency` message so Next.js rebuilds on save. An explicit
`config`/`theme` plugin option disables the watcher.

## 8. Unknown-class warnings

In development, a scanned class that resolves to nothing (and isn't
defined in the project's own CSS) prints a terminal warning with its
`file:line:column`. It names the fix when there is one, from the
engine's `suggest_class` (vite-plugin/wasmNode.ts
`suggestClassForToken`): `bg-blue-500` → "did you mean bg-blue-6? Kbach
color shades run 1–12, not 50–950.", `flexx` → "did you mean flex?".
The suggestion is computed only for a class that is really unknown.

## 9. Common failure modes

- **Build fails after adding/editing `kbach.config.js`** — an unquoted
  hyphenated object key (`surface-dim:` instead of `'surface-dim':`) is a
  syntax error; `loadConfigFile` (vite-plugin/index.ts) re-throws it
  rather than silently falling back to defaults, so the whole build fails
  loudly. Quote the key.
- **A dynamic `kb(...)` call returns nothing / throws** — `initKbach()`
  hasn't resolved yet. It's async; await it once before the first `kb()`
  call, or prefer a static `safelist` entry when the value set is known
  ahead of time.
- **A mode-aware color class (`bg-surface`, or a `{ light, dark }` color
  from `kbach.config.js`) has no style at all with plain `className`** —
  `@kbach/react` 1.0.0-beta.28 and earlier wrote rules only for the
  engine's expanded `bg-[#…] dark:bg-[#…]` classes, which only `kb()` and
  the jsx-runtime path ever put on an element. Fixed in the release after
  beta.28 (see §2). On an affected version, use the jsx-runtime path or
  write the two classes yourself.
- **A class works in one file but not another** — it's outside every
  `include` dir the plugin scans (default: `src`, `app`, `pages`,
  `components`). Add the directory via the plugin's `include` option.
