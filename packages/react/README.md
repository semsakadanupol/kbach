# @kbach/react

Tailwind-like utility classes for React (web). Write `className` strings — a custom JSX runtime resolves them at render time. An optional Vite plugin outputs a static `kbach.css` for zero runtime cost.

```jsx
<div className="bg-white dark:bg-gray-10 p-4 rounded-xl shadow" />
<div className="bg-blue-7 hover:bg-blue-8 dark:bg-indigo-6 rounded-lg px-6 py-3" />
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
```

## Install

```
npm install @kbach/react
```

[npm package](https://www.npmjs.com/package/@kbach/react)

## Setup

One step is always required, then pick **one** of the two setups below — they're independent, don't mix them.

### Step 1 — JSX runtime (always required)

**tsconfig.json:**

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@kbach/react" } }
```

That's the only setting needed — Vite, Next.js, and React Router all read it. Don't *also* set `jsxImportSource` on a bundler plugin (e.g. `@vitejs/plugin-react`); one source of truth avoids conflicts.

### Which setup do I need?

| Framework | Use |
|---|---|
| Next.js | **[Runtime setup](#runtime-setup)** — Static CSS doesn't apply (webpack/Turbopack, not Vite) |
| React Router, framework mode | **[Static CSS setup](#static-css-setup)** — and skip `@vitejs/plugin-react`, see note in that section |
| Vite, React Router library mode, CRA, other | Either — Runtime is faster to try, Static CSS is zero-cost for production |

## Runtime setup

Client-side CSS injection — works with any bundler (Vite, webpack, Turbopack, Metro-for-web, …), no build plugin. This is the whole setup:

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

That's it — done. `<KbachReset />` renders the base reset (see [CSS resets](#css-resets)) as real markup instead of waiting on client JS — matters most for SSR, where it avoids a flash of unstyled browser defaults before hydration. `@kbach/react` ships its own `"use client"` directive, so this works in a Next.js Server Component tree with no wrapper needed — in Next.js, render it once in the root `layout.tsx`.

Don't also set up Static CSS below in the same app — pick one.

## Static CSS setup

Vite only. A build-time plugin writes real CSS into a file you import at build time — nothing generated client-side, zero runtime cost. Three pieces, all required:

**1. Add the plugin:**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { kbach } from '@kbach/react/vite';

export default defineConfig({ plugins: [kbach()] });
```

**2. Create an empty stylesheet with the markers, and import it once:**

```css
/* src/kbach.css */
/* kbach:start */
/* kbach:end */
```

```ts
// main.tsx
import './kbach.css';
```

**3. Wrap your app — no `<KbachReset />` here, `kbach.css` already includes the reset:**

```jsx
import { ThemeProvider } from '@kbach/react';

export default function Root() {
  return <ThemeProvider defaultMode="system"><App /></ThemeProvider>;
}
```

Done. The plugin scans your source at build time and writes CSS between the markers — importing `kbach.css` auto-disables runtime injection, so there's no double-styling between this and the Runtime setup above. It also warns in the terminal (with a clickable `file:line`) for any class it doesn't recognize as a real utility or an existing CSS rule elsewhere in the project — usually a typo.

**React Router framework mode:** don't add `@vitejs/plugin-react` — `reactRouter()` already provides JSX handling, and both together crash the page (`Identifier 'RefreshRuntime' has already been declared`).

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import { kbach } from '@kbach/react/vite'; // omit if using Runtime setup instead

export default defineConfig({ plugins: [kbach(), reactRouter()] });
```

(React Router library mode — `createBrowserRouter`, no SSR — has no such conflict; set it up like any Vite + React app.)

## Dark mode

`<ThemeProvider>` powers every `dark:` class — detects OS color scheme, persists the user's choice, re-renders on change.

```jsx
<ThemeProvider
  defaultMode="system"        // 'light' | 'dark' | 'system'
  disablePersistence={false}  // true = don't remember across reloads
>
  <App />
</ThemeProvider>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `defaultMode` | `'light' \| 'dark' \| 'system'` | `'system'` | Starting mode |
| `disablePersistence` | `boolean` | `false` | Skip saving to `localStorage` |
| `config` | `FrameworkConfig` | global config | Scope a different config to this subtree |

`darkMode` in `kbach.config.js` picks the matching strategy: `'attribute'` (default), `'class'`, or `'media'` (system-only). Toggle it with `useTheme()`'s `toggle()`/`setMode()` — see [API](#api).

## API

### className / kb

`kb` is an alias for `className` — works on any element.

```jsx
<button className="bg-blue-7 hover:bg-blue-8 pressed:bg-blue-9 rounded-lg px-4 py-2" />
```

### styled(Component, classes)

```jsx
import { styled } from '@kbach/react';

const Card = styled('div', 'bg-white dark:bg-gray-9 rounded-2xl p-6 shadow');
const Button = styled('button', 'bg-blue-7 hover:bg-blue-8 rounded-xl px-6 py-3');

<Card kb="mt-4">
  <Button kb="w-full">Submit</Button>
</Card>
```

Extra classes at use time via `kb` merge with the base classes.

### cx(...classes)

```jsx
import { cx } from '@kbach/react';

<div className={cx('p-4 rounded-xl', isSelected && 'border-2 border-blue-6', isDisabled && 'opacity-50')} />
```

Falsy values ignored. Also works as pre-built style constants:

```ts
export const container = cx('flex-1 bg-white dark:bg-gray-9 p-4');
```

### useStyles(classes, state?)

```jsx
const style = useStyles('bg-blue-6 dark:bg-indigo-6 px-3 py-1 rounded-full');
const style2 = useStyles('bg-blue-5 pressed:bg-blue-7 rounded-lg', { pressed });
```

### kb(classes)

Resolve outside a component:

```js
const cardStyle = kb('bg-white p-4 rounded-xl') as React.CSSProperties;
```

### useTheme()

```js
const { mode, resolvedMode, isDark, setMode, toggle, config } = useTheme();
```

| Value | Type | Description |
|---|---|---|
| `mode` | `'light' \| 'dark' \| 'system'` | User-selected mode |
| `resolvedMode` | `'light' \| 'dark'` | Resolved after system lookup |
| `isDark` | `boolean` | `resolvedMode === 'dark'` |
| `setMode` | `fn` | Set mode explicitly |
| `toggle` | `fn` | Toggle light/dark |
| `config` | `ResolvedConfig` | Full resolved config |

### useIsDark() / useColors()

```js
const isDark = useIsDark();

const colors = useColors();
colors.blue[6]              // '#3b82f6'
colors.blue['6/50']         // 'rgba(59,130,246,0.5)'
colors.alpha('#ff6b35', 60) // 'rgba(255,107,53,0.6)'
```

## Modifiers

Chain in any order: `<div className="dark:sm:hover:p-4" />`

| Category | Modifiers |
|---|---|
| Theme | `dark:` `light:` / `not-dark:` |
| Interactive | `hover:` `focus:` `pressed:` `active:` `disabled:` `checked:` `visited:` `placeholder:` (all have `not-` variants) |
| Structural | `first:` `last:` `odd:` `even:` `only:` `focus-within:` `focus-visible:` |
| Pseudo-elements | `before:` `after:` `selection:` `first-letter:` `first-line:` `marker:` |
| Responsive | `sm:`(576px) `md:`(768px) `lg:`(1024px) `xl:`(1280px) `2xl:`(1536px) |
| Other | `print:` `landscape:`/`portrait:` `motion-reduce:`/`motion-safe:` `contrast-more:`/`contrast-less:` `rtl:`/`ltr:` `!` (important) |

```jsx
<div className="before:content-['*'] before:text-red-6 relative" />
```

**Group / peer:**

```jsx
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
```

Nested groups need names (`group/card`, `group-hover/card:`) or the inner element reacts to whichever `.group` is nearest, not necessarily the one you meant.

## Arbitrary values

```jsx
<div className="bg-[#6366f1] p-[14px] w-[calc(100%-2rem)] text-[18px]" />
```

For a property with no named utility: `[property:value]` — e.g. `[mask-type:luminance]`, `[--my-var:10px]`. Underscores become spaces: `[background:url(/a.png)_no-repeat]`.

## Color system

12-shade scale, 1 lightest → 12 darkest: `bg-blue-6`, `text-gray-10`, `border-red-4/50`.

Families: `slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose`
Special: `transparent` `current` `black` `white`
Opacity: `bg-blue-6/50` or `bg-blue-6/[0.15]`

## CSS resets

Included in `kbach.css`, runtime injection, and `<KbachReset />` alike:

- Border-box everywhere; `border-*` utilities work without needing `border-solid`
- `body` margin/padding cleared; headings/`p`/`ul`/`ol`/`a` styling cleared to inherit
- `img`/`video`/`svg` block + max-width 100%
- `button`/text inputs/`textarea` stripped of native appearance so `bg-`/`rounded-`/`p-` fully restyle them
- Checkbox/radio/`select` keep native rendering (just typography/spacing normalized + `accent-color: currentColor`)

## Configuration

```js
// kbach.config.js
module.exports = {
  darkMode: 'attribute', // 'attribute' | 'class' | 'media'

  theme: {
    colors: { brand: { 1: '#eff6ff', 6: '#3b82f6', 10: '#1e3a5f' } }, // replaces the section
  },

  extend: {
    colors: { brand: { 6: '#6366f1' } }, // adds to defaults
    spacing: { 18: '72px' },
    screens: { '3xl': '1920px' },
    fontFamily: { sans: 'Inter, sans-serif' },
    keyframes: {
      wiggle: { '0%, 100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
    },
    animation: { wiggle: 'wiggle 1s ease-in-out infinite' },
  },

  plugins: [
    ({ addUtility, addVariant, theme }) => {
      addUtility('border-brand', { borderColor: theme('colors.brand.6'), borderWidth: 2 });
      addVariant('hocus', ':hover, :focus');
    },
  ],
};
```

- `fontFamily.sans` set to anything but `'System'` auto-injects `body { font-family: … }`
- Custom `@keyframes` are used as `animate-{name}`, and can be overridden inline: `animate-[wiggle_2s_ease-in-out]`
- Colors can alias each other: `primary: 'blue-6'`, `brand: { 6: 'primary' }`
- Runtime update: `updateConfig({ extend: { ... } }); clearCache();`

## Full reference

[kbach-react.md](./kbach-react.md) — complete utility list, every modifier, all config options.

React Native / Expo: [`@kbach/native`](https://www.npmjs.com/package/@kbach/native).
