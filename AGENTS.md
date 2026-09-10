# Kbach — reference for AI assistants

A complete guide to using **`@kbach/react`** (web) and
**`@kbach/react-native`** (React Native), and to how the engine works
underneath. Written to be read start-to-finish or jumped into by section.

The user-facing package READMEs are deliberately short; this file is the
authoritative reference.

---

## 1. What Kbach is

A utility-first styling engine — the same class-name vocabulary as Tailwind
CSS v4, plus Kbach's own 22-family color palette — with a **shared Rust
core** compiled to different targets, and two thin bindings on top:

| Package | Target | Resolution model |
| :-- | :-- | :-- |
| `@kbach/core-engine` | Rust → WASM (web) + JNI `.so` (Android). Consumed by the two below; not used directly. | Parser + resolvers. |
| `@kbach/react` | Web / DOM | Class strings are scanned at **build time** and compiled to a real CSS file. |
| `@kbach/react-native` | Android (JNI), Expo Web (WASM), Expo Go (JS fallback) | Class strings are resolved to a **style object at render time**. |

Both bindings read the same optional `kbach.config.js` and expose the same
`useTheme()` / `useColors()` / dark-mode API.

---

## 2. `@kbach/react` (web)

### 2.1 Install + wire up the build

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

### 2.2 How resolution works

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

### 2.3 Runtime pieces (opt-in, these DO call the engine)

- **`kb(dynamicClassString)`** — resolve a class list assembled from
  runtime data (`kb(\`bg-${color}-6\`)`). Requires `await initKbach()` once
  before first use. Prefer a `safelist: [...]` plugin entry when the
  possible values are known ahead of time (stays fully static).
- **`@kbach/react/jsx-runtime`** — a `jsxImportSource` override that
  intercepts *every* element's `className` at runtime instead of relying on
  the static scan. Also needs `await initKbach()`.

### 2.4 Dark mode

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

### 2.5 Plugin options (`KbachPluginOptions`)

`root`, `theme` (a resolved `ThemeConfig`), `config` (a `KbachConfig`, same
shape as `kbach.config.js`), `include` (dirs to scan), `safelist` (classes
to always emit), `cssFile` (explicit output path). PostCSS: `root` defaults
to `process.cwd()`; pass it if `postcss.config.js` isn't at the project
root.

### 2.6 Exports

`initKbach`, `isKbachReady`, `kb`, `disableRuntimeCSS`,
`isRuntimeCSSDisabled`, `setTheme`, `getTheme`, `defaultTheme`,
`KbachReset`, `resolveKbachConfig`, `applyKbachConfig`, `useTheme`,
`ThemeProvider`, `useColors`, `clsx`, `getGlobalDarkMode`,
`getGlobalThemeMode`, `setGlobalThemeMode`, `toggleGlobalDarkMode`,
`subscribeGlobalDarkMode`. Types: `ThemeConfig`, `ColorEntry`,
`ContainerConfig`, `DarkModeStrategy`, `KbachConfig`, `ThemeState`,
`ThemeProviderProps`, `ThemeMode`, `ColorsAPI`, `ColorScale`, `ClassValue`.

---

## 3. `@kbach/react-native`

### 3.1 Install + setup

```sh
npm install @kbach/react-native@beta
```

| Target | Setup |
| :-- | :-- |
| **Expo Go** | None. A pure-JS fallback engine loads automatically (reduced utility coverage). |
| **Expo Web** / `react-native-web` | None. Uses the same WASM CSS engine as `@kbach/react`. |
| **Expo dev client / prebuild / EAS** | Babel plugin, then `npx expo prebuild && npx expo run:android`. Full native engine. |
| **React Native CLI** | Babel plugin, then rebuild the Android app. |

Babel plugin — added to the existing `babel.config.js` (keep the function
form Expo generates; only add the `plugins` entry):

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@kbach/react-native/babel-plugin'],
  };
};
```

React Native CLI uses `presets: ['module:@react-native/babel-preset']` and
a plain object export.

### 3.2 What the babel plugin does

Per user source file (never `node_modules`, never Metro/Expo virtual
modules, never `kbach.config.js` itself):

1. Prepends a `// @jsxImportSource @kbach/react-native` comment so the JSX
   transform routes `className` through this package's jsx-runtime.
2. Prepends `require('@kbach/react-native').applyKbachConfig(require('<abs
   path>/kbach.config.js'))` if that file exists at the project root — so
   the config is applied before the app's first render with **no import or
   call in app code**.

A dev-server restart is required after changing `kbach.config.js` or the
babel config.

### 3.3 How resolution works

`className` on a host element (`View`, `Text`, `Pressable`, …) is
intercepted by the jsx-runtime and resolved to a style object. One of three
engines does the work, chosen automatically:

| Runtime | Engine | Mechanism |
| :-- | :-- | :-- |
| Android dev-client / CLI build | **Rust via JNI** (`KbachModule` TurboModule, prebuilt `.so`) | `resolveStyle(classString, themeJson, colorScheme, pressed, width)` → JSON style object. |
| Expo Web / `react-native-web` | **Rust via WASM** (`generate_css_attr`) | Emits real CSS rules into a `<style>` tag; element gets `dataSet={{ kb }}` and rules target `[data-kb~="…"]`. Full modifier set. |
| Expo Go | **Pure-JS fallback** (`jsEngine/`) | A partial TS port of the native resolver. No custom native module can load in Expo Go. |

Resolution is memoized per `(classString, pressed, colorScheme, width,
theme)`.

### 3.4 Modifiers on native

Native has no selector/cascade engine. Two groups:

**Resolved in the engine from live parameters:**
- `dark:` — current OS/app color scheme.
- `sm:` `md:` `lg:` `xl:` `2xl:` — window width vs `theme.screens`.
- `min-[500px]:` / `max-[30rem]:` — arbitrary width breakpoints (constant
  px/rem only).
- `active:` — `Pressable` press state (via its style-callback).

**Resolved in `jsxRuntimeCore.ts` from React props, before the engine sees
the string:**
- `hover:` — `onHoverIn`/`onHoverOut` (only fires with real pointer input).
- `focus:` — `onFocus`/`onBlur`.
- `disabled:` — the element's own `disabled` prop.
- `data-[key=value]:` / `data-[key]:` / `aria-[…]:` / static `aria-*`
  shortcuts — the element's own `data-*` / `aria-*` props.

A satisfied prop-based modifier is rewritten to an internal `_kbon` marker
(one per satisfied modifier) so it still contributes to specificity.

**Not supported** (parse without error, never apply): `group-*`, `peer-*`,
`has-[…]`, container queries, `*:` / `**:`, `before:` / `after:` and other
pseudo-elements.

**Specificity / class order.** When two classes set the same property, the
one with more satisfied modifiers wins **regardless of source order** —
`dark:bg-black bg-white` and `bg-white dark:bg-black` both resolve to black
in dark mode, matching web. Equal specificity falls back to last-token-wins.
`transform-none` is an exception: it clears all transforms above it in
source order regardless of specificity.

Chaining composes and is order-independent (`dark:sm:` ≡ `sm:dark:`); every
named condition must hold.

### 3.5 Expo Go coverage gap

The JS fallback covers: layout, spacing, border/radius, plain colors,
font-weight, text-transform/decoration, line-height, letter-spacing,
shadows, and the RN-representable transforms (`translate-x/y`,
`scale`/`scale-x/y`, `rotate`/`rotate-x/y/z`, `skew-x/y`, `transform-none`,
`backface-*`).

Not covered: grid, filters, gradients, DOM-only typography, and transforms
with no RN equivalent (`translate-z`, `scale-z`, `perspective*`, `origin`,
`transform-gpu/cpu`). Same scope native itself excludes. Typo warnings are
also unavailable in Expo Go (no full-vocabulary resolver to check against).

### 3.6 Dark mode

Zero setup on all targets. On native `dark:` is resolved from a live
parameter every render — no build step to keep in sync. Expo Web defaults
to the `'attribute'` strategy.

```tsx
import { useTheme } from '@kbach/react-native';
const { mode, isDark, setMode, toggle } = useTheme();
```

No provider required. `<ThemeProvider>` optionally seeds a startup
`defaultMode` and enables persistence:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
<ThemeProvider persist={AsyncStorage}><App /></ThemeProvider>;
```

`persist` takes any `{ getItem, setItem }` async store. The persisted mode
is read once on mount and wins over `defaultMode`; later changes are
written back. This package never imports a storage library itself.

Outside React: `getGlobalDarkMode()` / `toggleGlobalDarkMode()` /
`setGlobalThemeMode()`.

### 3.7 `calc()` / `min()` / `max()` / `clamp()`

- **Constant** px/rem/bare-number expressions are reduced at resolve time:
  `p-[calc(16px+8px)]` → `padding: 24`. No spaces or underscores are
  required around operators; `calc(16px+8px)` is fine.
- **Viewport-relative** (`calc(10vw+8px)`): no such unit on native — the
  declaration is dropped and a dev-only `console.warn` explains why.
- **Percentage-relative `width`/`height`** (`w-[calc(100%-3rem)]`,
  `w-[min(50%,20rem)]`, `w-[clamp(16rem,50%,32rem)]`): supported via a
  one-frame measure-then-snap — renders at `100%`, measures via
  `onLayout`, then corrects to the computed number; re-measures on layout
  changes. Narrow shapes only: `calc()` = one percent term + one constant
  term; `min`/`max` args each a plain percent OR a constant expression (not
  mixed); `clamp` exactly three args; `width`/`height` only.
- **Literal spaces are illegal inside `[...]`** on any Tailwind-family
  engine (a space splits the class token). Use underscores if you want them
  for readability: `w-[calc(100%_-_3rem)]`.

### 3.8 Dynamic tokens (native counterpart to CSS custom properties)

```tsx
import { setDynamicToken, useDynamicToken } from '@kbach/react-native';

setDynamicToken('sidebar-width', '240px');
<View className="w-[var(--sidebar-width)]" />;
const w = useDynamicToken('sidebar-width'); // '240px' | undefined, reactive
```

On web `setDynamicToken` writes a real CSS custom property (browser
repaints, no re-render). On native the token value is substituted into the
class string before each resolve, and subscribed elements re-render on
change. `var(--x)` in a `className` already works unaided on Expo Web.

### 3.9 Reading colors as values

```tsx
import { useColors } from '@kbach/react-native';

const colors = useColors();
colors.blue[6];        // '#2563eb'
colors.blue['6/50'];   // 50% opacity
colors.alpha(colors.blue[6], 30);
colors.get('brand');   // a custom color, typed as plain `string`
```

`colors.blue[n]` auto-mirrors to shade `13 - n` in dark mode (palette
convention: 1 = lightest, 12 = darkest). `colors.brand` (a custom flat
color) is typed `string | ColorScale` because the same object also serves
shade families and TS can't tell them apart statically — use
`colors.get(name)` when you need a guaranteed `string`.

### 3.10 Unknown-class warnings

On a native dev-client/CLI build, a class matching no Kbach utility on any
platform emits a one-time `console.warn` (dev only). A real utility native
just doesn't support yet (`grid-cols-3`, `blur`, …) stays silent — that's a
documented platform gap, not a typo. Not available in Expo Go.

### 3.11 Monorepo / workspace installs

If `@kbach/react-native` is a workspace/hoisted dependency, Metro can end
up with **two physical copies of `react-native` / `react`** — different
files resolve to different module instances, and a dark-mode toggle can
silently do nothing. Force a single instance in your app's
`metro.config.js` via `resolver.resolveRequest`, pointing `react-native`
and `react` at `projectRoot/node_modules/...`. A plain non-monorepo
`npm install` never hits this.

### 3.12 Exports

`setTheme`, `getTheme`, `defaultTheme`, `resolveStyle`, `resolveKbachConfig`,
`applyKbachConfig`, `useTheme`, `ThemeProvider`, `useColors`,
`setDynamicToken`, `getDynamicToken`, `deleteDynamicToken`,
`subscribeDynamicTokens`, `useDynamicToken`, `clsx`, `getGlobalDarkMode`,
`getGlobalThemeMode`, `setGlobalThemeMode`, `toggleGlobalDarkMode`,
`subscribeGlobalDarkMode`. Types: `ThemeConfig`, `ColorEntry`,
`ContainerConfig`, `StyleObject`, `KbachConfig`, `ThemeState`,
`ThemeProviderProps`, `ThemeStorageAdapter`, `ThemeMode`, `ColorsAPI`,
`ColorScale`, `ClassValue`.

Subpath exports: `@kbach/react-native/babel-plugin`,
`@kbach/react-native/jsx-runtime`, `@kbach/react-native/jsx-dev-runtime`.

---

## 4. `kbach.config.js` (shared by both packages)

A plain JS module exporting a `KbachConfig`. On web the plugin
auto-discovers it at the project root; on native the babel plugin
auto-applies it. Same shape either way.

```js
module.exports = {
  darkMode: 'media',        // 'media' (default) | 'attribute' | 'class'
  theme: { /* REPLACES a section of the defaults entirely */ },
  extend: { /* MERGES into the defaults — the common case */ },
};
```

> **Plain JavaScript, not JSON.** Any object key containing a hyphen must
> be quoted: `'surface-dim': '#121318'`. An unquoted `surface-dim:` is a
> syntax error and the whole file fails to load (on native this surfaces as
> a Metro bundling error).

### 4.1 `extend.colors`

Each value is a literal color OR a reference to another color name,
optionally with an `/opacity` suffix (0–100):

```js
colors: {
  brand: '#ff6b35',           // literal hex
  accent: 'orange-5',         // references a built-in palette color
  accentSoft: 'orange-5/50',  // ...at 50% opacity
  brandSoft: 'brand/30',      // references a color defined EARLIER in this object
  danger: 'red',              // not a known name -> literal CSS value
}
```

**Mode-aware colors** — two equivalent forms:

```js
// per-color pair
colors: { surface: { light: 'gray-2', dark: 'gray-11' } }

// grouped `dark` block (better when most colors are mode-aware)
colors: {
  surface: 'gray-2',
  card: 'white',
  dark: { surface: 'gray-11', card: 'gray-9' },
}
```

Both make `bg-surface` (no `dark:` prefix) resolve to the right shade for
the current mode. `dark` is a reserved key, not a color name. A name under
`dark` with no matching top-level entry is skipped. On `@kbach/react` a
mode-aware color compiles to a live `rgb(var(--kb-color-<name>))` CSS
variable; on native it resolves to the concrete side for the current
scheme at render time.

### 4.2 Other `extend` sections

```js
extend: {
  spacing: { 128: 512 },                            // p-128
  screens: { '3xl': 1920 },                          // 3xl:flex-row
  fontFamily: { display: '"Cal Sans", sans-serif' }, // font-display
  container: { center: true, padding: '2rem' },
}
```

`fontFamily` values are web-shaped fallback stacks even in the native
package — native strips them to the first name at resolve time, so the
same config works unmodified on Expo Web.

### 4.3 `theme` vs `extend`

`theme.colors` / `theme.spacing` / `theme.screens` / `theme.fontFamily`
**replace** the built-in section entirely (e.g. `theme.colors` drops the
default 22-family palette). `extend` merges on top. `container` only exists
under `extend` (it's inherently additive).

### 4.4 Runtime application

`resolveKbachConfig(config)` → a merged `ThemeConfig` (pure function).
`applyKbachConfig(config)` = `resolveKbachConfig` + `setTheme` + re-sync of
dark-mode DOM state. Call `applyKbachConfig` yourself only to change the
theme *after* startup (e.g. a per-user theme after login); the normal
build-time / babel-time path needs no call.

---

## 5. The palette

22 hue families (`gray`, `red`, `orange`, `amber`, `yellow`, `lime`,
`green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`,
`purple`, `fuchsia`, `pink`, `rose`, `slate`, `zinc`, `neutral`, `stone`),
shades `1`–`12` (**1 = lightest, 12 = darkest** — inverse of Tailwind's
50–950), plus `white`, `black`, `transparent`, `current`.

Used as classes (`bg-blue-6`, `text-gray-11`) or as values via
`useColors().blue[6]`. The shade file is generated from the Rust source of
truth (`generate-palette.mjs`), not hand-maintained in either binding.

---

## 6. How the engine is built

`@kbach/core-engine` is a Rust crate. `npm run build` in that package
produces:

- `wasm-pack build --target web` → `dist/` — used by `@kbach/react` and by
  `@kbach/react-native`'s Expo Web path. Vendored as a base64-embedded
  `.wasm` + a trimmed glue file so bundlers don't choke on
  `import.meta.url`.
- `wasm-pack build --target nodejs` → `dist-node/` — used by the build
  plugins (Vite/PostCSS) at compile time.
- `build:android` (cargo-ndk) → `libkbach_core_engine.so` for `arm64-v8a`
  and `x86_64`, copied into
  `packages/react-native/android/src/main/jniLibs/`. **These are prebuilt
  binaries committed into the package** — a Rust change does NOT rebuild
  them at a consumer's build time; the maintainer must re-run
  `build:android` and republish. Verify with a `strings` grep against the
  `.so` when in doubt.

Internal pipeline (shared by all targets): **parser** (tokenizes a class
into modifiers + utility + arbitrary value) → **registry** (maps each
modifier to its selector/media/pseudo behavior and an ordering tier) →
**resolvers** (per utility family: layout, spacing, color, border,
typography, effects, transform, …) → either **`css.rs`** (emits CSS text,
web) or **`resolve_style.rs`** (emits an RN style object, native). Web
gets cascade/specificity for free from CSS + the registry's per-modifier
`order` tiers; native reconstructs a small specificity model
(satisfied-modifier count) in `resolve_style.rs`.

---

## 7. Cross-package differences at a glance

| | `@kbach/react` | `@kbach/react-native` |
| :-- | :-- | :-- |
| When classes resolve | Build time (plugin scan) | Render time (per element) |
| Output | CSS file | RN style object |
| Full modifier set | Yes | Web target only; native has a documented subset |
| `dark:` | Plain CSS | Live parameter (native) / CSS (web) |
| Dynamic classes | `kb()` + `initKbach()` | Always dynamic; no init step |
| `calc()` with non-constant units | Real CSS | Constant reduced; `%` w/h measured; `vw`/`vh` dropped |
| Config discovery | Vite/PostCSS plugin | Babel plugin auto-apply |

---

## 8. Common failure modes

- **`kbach.config.js` "does nothing" / Metro bundling error** — an
  unquoted hyphenated key. Quote it.
- **`bg-<custom>` renders nothing on native** — the color is mode-aware
  (`{light,dark}` / `dark:` block) and the app is on a stale
  `@kbach/react-native` (`< 1.0.0-beta.36`). Update.
- **A `dark:` variant loses to a plain class** — stale
  `@kbach/react-native` (`< 1.0.0-beta.37`); class-order independence
  landed there. Update.
- **`useColors().brand` type error** — assign via `colors.get('brand')`
  (`< beta.36` has no `.get`).
- **Dark toggle does nothing in a monorepo** — duplicate `react-native` /
  `react` instances; add the `metro.config.js` `resolveRequest` override.
- **Rust change not reflected on a real Android build** — stale prebuilt
  `.so`; the maintainer must re-run `build:android` and republish.
