# `@kbach/react` — reference for AI assistants

The web binding of [Kbach](https://github.com/semsakadanupol/kbach) — the
same Tailwind-v4-shaped class-name vocabulary as `@kbach/react-native`,
resolved at **build time** into a real CSS file via a shared Rust/WASM
core. This file covers `@kbach/react` only; for the cross-package
overview, `kbach.config.js` reference, the color palette, and how the
underlying engine is built, see the repo root's
[AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

---

## 1. Install + wire up the build

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

## 3. Runtime pieces (opt-in, these DO call the engine)

- **`kb(dynamicClassString)`** — resolve a class list assembled from
  runtime data (`kb(\`bg-${color}-6\`)`). Requires `await initKbach()` once
  before first use. Prefer a `safelist: [...]` plugin entry when the
  possible values are known ahead of time (stays fully static).
- **`@kbach/react/jsx-runtime`** — a `jsxImportSource` override that
  intercepts *every* element's `className` at runtime instead of relying on
  the static scan. Also needs `await initKbach()`.

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

## 7. Common failure modes

- **Build fails after adding/editing `kbach.config.js`** — an unquoted
  hyphenated object key (`surface-dim:` instead of `'surface-dim':`) is a
  syntax error; `loadConfigFile` (vite-plugin/index.ts) re-throws it
  rather than silently falling back to defaults, so the whole build fails
  loudly. Quote the key.
- **A dynamic `kb(...)` call returns nothing / throws** — `initKbach()`
  hasn't resolved yet. It's async; await it once before the first `kb()`
  call, or prefer a static `safelist` entry when the value set is known
  ahead of time.
- **A class works in one file but not another** — it's outside every
  `include` dir the plugin scans (default: `src`, `app`, `pages`,
  `components`). Add the directory via the plugin's `include` option.
