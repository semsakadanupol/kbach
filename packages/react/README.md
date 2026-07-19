# @kbach/react

Tailwind-like utility classes for React (web). Write classes as `className` strings — the custom JSX runtime resolves them at render time. A Vite plugin generates a static `kbach.css` file so styles ship as real CSS with zero runtime overhead in production.

```jsx
<div className="bg-white dark:bg-gray-10 p-4 rounded-xl shadow" />
<div className="bg-blue-7 hover:bg-blue-8 dark:bg-indigo-6 rounded-lg px-6 py-3" />
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
```

## Install

[npm package](https://www.npmjs.com/package/@kbach/react)

```
npm install @kbach/react
```

## Setup

Step 1 is always required. After that, pick **one** of the two setups below — Quick if you just want styles working, Static CSS if you're shipping to production and/or using SSR.

### 1. Configure the JSX runtime

**tsconfig.json** (works for Vite, Next.js, React Router, and most other tooling — it's the one setting that everything reads):

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@kbach/react"
  }
}
```

Don't also pass `jsxImportSource` to `@vitejs/plugin-react` (or any other bundler plugin) unless you have a specific reason to — the tsconfig setting alone is enough, and pointing two different places at the JSX runtime is a common source of "it's not applying" confusion (or, worse, plugin conflicts — see the React Router note below).

Alternatives if you can't use tsconfig: a per-file `/** @jsxImportSource @kbach/react */` pragma comment, or `['@babel/preset-react', { runtime: 'automatic', importSource: '@kbach/react' }]` in `babel.config.js` for non-Vite/non-SWC toolchains.

### 2a. Quick setup (runtime CSS injection)

No build plugin, works with any bundler (Vite, webpack, Turbopack, Metro-for-web, …). Styles are generated and injected into a `<style>` tag by client-side JS the moment `ThemeProvider` mounts.

```jsx
import { ThemeProvider, KbachReset } from '@kbach/react';

export default function Root() {
  return (
    <ThemeProvider defaultMode="system">
      <KbachReset />
      <App />
    </ThemeProvider>
  );
}
```

`<KbachReset />` renders Kbach's base browser-default reset (borderless buttons/inputs, visible checkboxes/radios, no arrow-less `<select>`, etc. — see [CSS resets](#css-resets) below) as a plain `<style>` tag instead of waiting for the client-side injector. On a plain client-rendered app (Vite CSR, Create React App, …) it's a nice-to-have, since the injector already runs before first paint there. **On SSR** (Next.js, React Router framework mode, Remix, …) it's the difference between correct styling from the first byte and a flash of raw browser defaults (default button border, unstyled `<select>`, serif-ish fonts, …) that only clears up once hydration finishes — the server has no JS to run the injector, but it *can* render this component, since it's just JSX. Put it as high in `<head>` as your framework allows; the snippet above (right after `ThemeProvider` opens) works everywhere `<head>` isn't directly reachable.

That's the whole setup. `@kbach/react` ships its own `"use client"` directive, so both of these work directly in a Next.js App Router Server Component tree — no manual client wrapper needed.

### 2b. Static CSS setup (recommended for production / SSR, Vite only)

Zero runtime cost: a Vite plugin scans your source at build time and writes real CSS into a file you import, so styles ship as an ordinary stylesheet with no client-side generation step at all — nothing to flash-of-unstyled before. This is the better choice for any Vite-based SSR framework (React Router, SvelteKit-style meta-frameworks, etc.) over the Quick setup + `<KbachReset />` combination, since it covers *every* class, not just the base reset.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { kbach } from '@kbach/react/vite';

export default defineConfig({
  plugins: [
    // ...your framework's own plugin(s) — see the framework notes below
    // before adding @vitejs/plugin-react yourself.
    kbach(),
  ],
});
```

Adding the plugin also declares `@kbach/react` in Vite's `optimizeDeps.include` upfront, so Vite pre-bundles it during its initial dependency scan instead of discovering it lazily on the first page that imports it — avoiding a forced full-reload mid-render, which is what a rare "Invalid hook call"-style crash on first load (but never again after) usually turns out to be.

Then create an empty `kbach.css` anywhere in your project and import it once in your app entry:

```css
/* src/kbach.css */
/* kbach:start */
/* kbach:end */
```

```ts
// main.tsx
import './kbach.css';
```

```jsx
import { ThemeProvider } from '@kbach/react';
// No <KbachReset /> needed — kbach.css already includes the same base reset.

export default function Root() {
  return (
    <ThemeProvider defaultMode="system">
      <App />
    </ThemeProvider>
  );
}
```

The plugin scans your source files and writes generated CSS between the `/* kbach:start */`/`/* kbach:end */` markers. Importing `kbach.css` automatically disables runtime injection — all styles come from the file instead. On HMR, only the changed file is rescanned; unchanged tokens reuse cached CSS.

While it's scanning, the plugin also indexes every `.css`/`.scss`/`.sass`/`.less` file under the same directories and warns in the terminal (not the browser console) for any class that's neither a real Kbach utility nor defined anywhere in those stylesheets — likely a typo. A class you've defined yourself elsewhere (CSS Modules, styled-components, a third-party component's class) is recognized as soon as something in the project literally has a `.that-class-name` rule, so it won't get flagged just because Kbach itself doesn't know it. Each warning includes a `file:line:column` location that most terminals (VS Code's integrated terminal included) turn into a clickable link straight to that class.

## Next.js

Step 1 (tsconfig `jsxImportSource`) above applies as-is — Next.js's SWC compiler reads `jsxImportSource` from `tsconfig.json` the same way Vite does. For step 2, use **Quick setup (2a)** — Next.js builds with webpack/Turbopack, not Vite, so the static-CSS plugin (2b) doesn't apply. Render `<KbachReset />` once in the root App Router `layout.tsx` (inside `<head>`, or right after `<ThemeProvider>` opens) so Server Component HTML gets the base reset without waiting on hydration; `@kbach/react` shipping its own `"use client"` directive means both `ThemeProvider` and `KbachReset` work directly in that Server Component tree with no wrapper of your own needed.

## React Router

**Framework mode (v7+, SSR by default):** `@react-router/dev`'s own `reactRouter()` Vite plugin already includes its own React JSX transform and Fast Refresh integration — **do not also add `@vitejs/plugin-react`.** Having both active makes each one inject its own Fast Refresh preamble into the same module, which crashes the page at runtime (`Identifier 'RefreshRuntime' has already been declared`) before React ever hydrates — every class on the page will silently fail to style because the app never actually mounts. The correct setup is just:

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import { kbach } from '@kbach/react/vite'; // omit if you're not using static CSS

export default defineConfig({
  plugins: [kbach(), reactRouter()],
});
```

`jsxImportSource` in `tsconfig.json` (step 1 above) is all that's needed for the JSX runtime — React Router's Vite plugin reads it the same way plain Vite does. `include`'s default scan dirs (`['src', 'app', 'pages', 'components', 'views', 'layouts']`) already cover React Router's `app/` routes convention if you're using the static-CSS plugin.

If you do add `kbach()` to `vite.config.ts` and it detects both plugins active together, it prints a warning explaining exactly this at dev-server startup — so this doesn't have to be a silent, hard-to-diagnose blank page.

Framework mode is SSR, so skipping the static-CSS plugin (2b) in favor of Quick setup (2a) means the initial server-rendered HTML has no CSS at all until hydration — render `<KbachReset />` in `root.tsx`'s `<Layout>` (inside `<head>`, alongside `<Links />`/`<Meta />`) if you go that route, otherwise expect raw browser defaults (e.g. the native `<button>` border) on first paint.

**Library mode (client-only, `createBrowserRouter`/`<BrowserRouter>`):** no SSR involved — set it up exactly like any other Vite + React app. Since there's no meta-framework Vite plugin providing JSX handling here, you likely do need `@vitejs/plugin-react({ jsxImportSource: '@kbach/react' })` (or rely on tsconfig alone — Vite's default esbuild-based transform reads it too).

## API

### className / kb prop

Works on any HTML element or React component once the JSX runtime is configured. `kb` is an alias for `className`.

```jsx
<div className="bg-white dark:bg-gray-10 p-4 rounded-xl" />
<p kb="text-gray-10 dark:text-white text-lg font-bold" />
<button className="bg-blue-7 hover:bg-blue-8 pressed:bg-blue-9 rounded-lg px-4 py-2" />
```

### styled(Component, classes)

Pre-style any component. Returns a new component that merges the base classes with any `kb` prop passed at use time.

```jsx
import { styled } from '@kbach/react';

const Card = styled('div', 'bg-white dark:bg-gray-9 rounded-2xl p-6 shadow');
const Button = styled(
  'button',
  'bg-blue-7 hover:bg-blue-8 dark:bg-indigo-6 rounded-xl px-6 py-3'
);

<Card kb="mt-4">
  <Button kb="w-full">Submit</Button>
</Card>
```

### cx(...classes)

Conditionally join class strings. Falsy values are ignored. The Vite plugin scans `cx()` calls when building the static CSS.

```jsx
import { cx } from '@kbach/react';

<div className={cx(
  'p-4 rounded-xl',
  isSelected && 'border-2 border-blue-6',
  isDisabled && 'opacity-50',
)} />
```

Pre-built style constants (also scanned by the Vite plugin):

```ts
// styles.ts
import { cx } from '@kbach/react';

export const container = cx('flex-1 bg-white dark:bg-gray-9 p-4');
export const heading   = cx('text-2xl font-bold text-gray-10 dark:text-white');
```

```jsx
import { container, heading } from './styles';

<div className={container}>
  <h1 className={heading}>Hello</h1>
</div>
```

### useStyles(classes, state?)

Resolve classes to a style object inside a component.

```jsx
import { useStyles } from '@kbach/react';

const style = useStyles('bg-blue-6 dark:bg-indigo-6 px-3 py-1 rounded-full');

// Multiple strings merged left-to-right
const style = useStyles(['bg-white p-4', 'dark:bg-gray-9 rounded-xl']);

// With interaction state
const [pressed, setPressed] = useState(false);
const style = useStyles('bg-blue-5 pressed:bg-blue-7 rounded-lg', { pressed });
```

### kb(classes)

Resolve classes outside a component (static contexts).

```js
import { kb } from '@kbach/react';

const cardStyle = kb('bg-white p-4 rounded-xl') as React.CSSProperties;
```

### useTheme()

```js
import { useTheme } from '@kbach/react';

const { mode, resolvedMode, isDark, setMode, toggle, config } = useTheme();
```

| Value | Type | Description |
|---|---|---|
| `mode` | `'light' \| 'dark' \| 'system'` | User-selected mode |
| `resolvedMode` | `'light' \| 'dark'` | Resolved after system lookup |
| `isDark` | `boolean` | Shorthand for `resolvedMode === 'dark'` |
| `setMode` | `fn` | Set mode explicitly |
| `toggle` | `fn` | Toggle between light and dark |
| `config` | `ResolvedConfig` | Full resolved config |

### useIsDark()

```js
import { useIsDark } from '@kbach/react';
const isDark = useIsDark();
```

### useColors()

Returns the active theme's color palette as a smart proxy.

```js
import { useColors } from '@kbach/react';

const colors = useColors();
colors.blue[6]              // '#3b82f6'
colors.blue['6/50']         // 'rgba(59,130,246,0.5)'
colors.white                // '#ffffff'
colors['white/20']          // 'rgba(255,255,255,0.2)'
colors.alpha('#ff6b35', 60) // 'rgba(255,107,53,0.6)'
```

## Modifiers

Chain modifiers in any order before the utility name:

```jsx
<div className="dark:sm:hover:p-4" />
<input className="focus:ring-2 focus:ring-blue-5 focus:outline-none" />
```

### Theme

| Modifier | Trigger |
|---|---|
| `dark:` | Dark mode |
| `light:` / `not-dark:` | Light mode |

### Interactive

| Modifier | Trigger |
|---|---|
| `hover:` | Mouse hover |
| `focus:` | Element focused |
| `pressed:` | Click / touch down |
| `active:` | Active state |
| `disabled:` | Disabled |
| `checked:` | Checkbox / radio checked |
| `visited:` | Visited link |
| `placeholder:` | Placeholder text |

Negated: `not-hover:`, `not-focus:`, `not-pressed:`, `not-active:`, `not-disabled:`, `not-checked:`

### Structural

`first:` `last:` `odd:` `even:` `only:` `focus-within:` `focus-visible:`

### Pseudo-elements

`before:` `after:` `selection:` `first-letter:` `first-line:` `marker:` `placeholder:`

```jsx
<div className="before:content-['*'] before:text-red-6 relative" />
<p className="selection:bg-blue-3" />
<input className="placeholder:text-gray-5" />
```

### Group / peer

```jsx
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
<input className="peer" />
<p className="peer-focus:text-blue-6" />
```

Nested groups need names, or the inner element reacts to whichever `.group` is nearest — not necessarily the one you meant:

```jsx
<div className="group/card">
  <div className="group/icon">
    <span className="group-hover/icon:opacity-100" /> {/* only the inner group */}
  </div>
  <span className="group-hover/card:underline" />      {/* only the outer group */}
</div>
```

### Responsive

| Modifier | Min-width |
|---|---|
| `sm:` | 576 px |
| `md:` | 768 px |
| `lg:` | 1024 px |
| `xl:` | 1280 px |
| `2xl:` | 1536 px |

### Other

| Modifier | Effect |
|---|---|
| `print:hidden` | Visible only on screen |
| `landscape:` `portrait:` | Orientation |
| `motion-reduce:` `motion-safe:` | Reduced-motion preference |
| `contrast-more:` `contrast-less:` | Contrast preference |
| `rtl:` `ltr:` | Text direction |
| `!p-0` | `!important` on every declaration |

## Arbitrary values

```jsx
<div className="bg-[#6366f1]" />
<div className="p-[14px]" />
<div className="w-[calc(100%-2rem)]" />
<div className="bg-[rgba(99,102,241,0.15)]" />
<div className="text-[18px]" />
```

## Color system

12-shade scale — 1 lightest, 12 darkest. Use as `bg-blue-6`, `text-gray-10`, `border-red-4/50`.

Families: `slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose`  
Special: `transparent` `current` `black` `white`

Opacity modifier: `bg-blue-6/50` (50% alpha), `bg-blue-6/[0.15]` (arbitrary)

## CSS resets

Included automatically in `kbach.css`, in runtime injection, and in `<KbachReset />` (all three render the exact same rules — pick whichever setup you're using from [Setup](#setup) above):

- `*, *::before, *::after { box-sizing: border-box; border-width: 0; border-style: solid; border-color: currentColor }` — border utilities like `border-2 border-gray-4` work on any element without also needing `border-solid`
- `body { margin: 0; padding: 0 }`
- `h1–h6` — margin, font-size, font-weight cleared (inherit from parent)
- `p`, `ul`, `ol` — margin and list style cleared
- `a` — color and underline cleared (inherit from parent)
- `img`, `video`, `svg` — `display: block; max-width: 100%`
- `button`, text-like `input`s (not checkbox/radio), `textarea` — appearance, border, padding cleared, so `border-`/`bg-`/`rounded-`/`p-` utilities fully restyle them
- `input[type=checkbox]`, `input[type=radio]`, `select` — native rendering kept (stripping it would hide the checkmark/dot/dropdown-arrow with nothing to replace them); only typography and spacing are normalized, and checkbox/radio/range get `accent-color: currentColor` so they still pick up your text color instead of the OS default blue
- `fieldset`, `table` — padding/margin/border-collapse cleared

## Configuration

```js
// kbach.config.js
module.exports = {
  darkMode: 'attribute', // 'attribute' | 'class' | 'media'

  theme: {
    // Replace a section entirely
    colors: { brand: { 1: '#eff6ff', 6: '#3b82f6', 10: '#1e3a5f' } },
  },

  extend: {
    // Add to defaults
    colors: { brand: { 6: '#6366f1' } },
    spacing: { 18: '72px' },
    screens: { '3xl': '1920px' },
    fontFamily: {
      sans:        'Inter, sans-serif',
      'sans-bold': 'Inter_700Bold, sans-serif',
    },
  },

  plugins: [
    ({ addUtility, addVariant, theme }) => {
      addUtility('border-brand', {
        borderColor: theme('colors.brand.6'),
        borderWidth: 2,
      });
      addVariant('hocus', ':hover, :focus');
    },
  ],
};
```

Setting `fontFamily.sans` to anything other than `'System'` auto-injects `body { font-family: … }`.

Color aliases:

```js
extend: {
  colors: {
    primary: 'blue-6',       // resolves to blue shade 6's hex
    brand: { 6: 'primary' }, // follows through to blue-6's hex
  },
},
```

Runtime update:

```js
import { updateConfig, clearCache } from '@kbach/react';
updateConfig({ extend: { colors: { brand: { 6: '#6366f1' } } } });
clearCache();
```

## Full reference

See [kbach-react.md](./kbach-react.md) for the complete utility reference, all modifier tables, and configuration options.

For React Native / Expo, see [`@kbach/native`](https://www.npmjs.com/package/@kbach/native).
