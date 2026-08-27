# @kbach/react

A utility-first styling engine for React, powered by a Rust/WASM core.
Tailwind CSS v4 feature parity, plus Kbach's own color palette.

> Beta — API may still change before 1.0.0.

## Install

```sh
npm install @kbach/react
```

## Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/react/vite';

export default defineConfig({
  plugins: [kbach(), react()],
});
```

That's it — the plugin finds or creates your `kbach.css` on its own,
wherever your source actually lives (`src/`, `app/`, ...; see "Where does
`kbach.css` go?" below if you want to know exactly where or control it).
Import it once from your entry point and render normally:

```tsx
// main.tsx
import { createRoot } from 'react-dom/client';
import App from './App';
import './kbach.css';

createRoot(document.getElementById('root')!).render(<App />);
```

```tsx
<div className="flex items-center gap-4 bg-blue-6 text-white p-4 rounded-lg">
  Hello Kbach
</div>
```

No `initKbach()`/async step before your first render: `className` here is
a plain string prop, resolved entirely by the CSS `@kbach/react/vite`
already generated at build time, same as any other static stylesheet —
nothing here calls into the WASM engine at render time, so there's nothing
to await.

### Where does `kbach.css` go?

You don't need to think about this for the common case — skip to
[React Router](#react-router)/[Next.js](#nextjs) if that's what brought you
here. For everyone else: the plugin looks for a file already containing
`/* kbach:start */`/`/* kbach:end */` markers under each of your `include`
directories (`src`, `app`, `pages`, `components` by default) and the
project root, in that order, and keeps using whichever one it finds. If
none exists yet, it creates `<first-existing-include-dir>/kbach.css` for
you, markers included — you never have to hand-author that file. Pass
`cssFile` to `kbach()` only if you want to pin the location explicitly
(a path outside every `include` dir, or more than one candidate present at
once).

`initKbach()` (still exported from `@kbach/react`) is only needed for two
opt-in features that genuinely do call into the Rust/WASM engine at
runtime: the dynamic [`kb()`](#dynamic-classes) function, and the optional
`@kbach/react/jsx-runtime` (a `jsxImportSource` override that intercepts
*every* element's `className` automatically instead of relying on the
static build). If you use either, `await initKbach()` once before your
first render, same as before.

## React Router

React Router is a client-side routing library with no build-tool coupling
of its own, so it layers on top of the exact same Vite + `kbach.css` setup
either way — but which "either way" depends on which of React Router's two
genuinely different modes you're using.

**Library mode** (you call `createRoot` yourself — `createBrowserRouter` +
`<RouterProvider>`, or the classic `<BrowserRouter>` component): needs
nothing beyond the Quick Start above.

```tsx
// main.tsx
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import './kbach.css';
import Home from './routes/home';
import About from './routes/about';

const router = createBrowserRouter([
  { path: '/', Component: Home },
  { path: '/about', Component: About },
]);

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
```

**Framework mode** (`npx create-react-router@latest` — file-based routing
under `app/`, its own Vite plugin, SSR by default):

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite';
import { kbach } from '@kbach/react/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [kbach(), reactRouter()],
});
```

Same `kbach()` call as everywhere else — its `app/`-vs-`src/` convention
is exactly what auto-detection (above) exists for, so there's nothing
React-Router-specific to configure. The one real gotcha is unrelated to
Kbach at all: **don't call `createRoot` yourself in `app/root.tsx`** — the
framework's own generated client/server entry points already do this;
`root.tsx` only ever *exports* a `Layout`/default component. Adding your
own `createRoot(...).render(...)` at that file's top level runs during SSR
too, where `document` doesn't exist, and crashes the build immediately.
`app/root.tsx` needs only:

```tsx
import './kbach.css';
export default function App() {
  return <Outlet />;
}
```

Either mode: every route's own components use `className` exactly like any
other component — routing has no effect on how Kbach resolves classes,
since resolution already happened at build time, before routing even
enters the picture.

## Next.js

Next.js uses webpack/Turbopack, not Vite, so `@kbach/react/vite` doesn't
apply — use `@kbach/react/postcss` instead, which does the exact same
build-time class-string scanning and CSS generation (they share the same
underlying engine), just wired into PostCSS, which both of Next.js's
bundlers already run for you with zero extra config.

```js
// postcss.config.js
module.exports = {
  plugins: {
    '@kbach/react/postcss': {},
  },
};
```

```css
/* app/globals.css (App Router) or styles/globals.css (Pages Router) */
/* kbach:start */
/* kbach:end */
```

```tsx
// app/layout.tsx
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Plain `className="..."` strings on Server Components work with zero extra
setup — the CSS already exists at build time, same as any other static
stylesheet. Hook-based exports (`useTheme`, `useColors`, `<ThemeProvider>`)
already carry their own `'use client'` directive, so importing them into a
Client Component just works; importing one into a Server Component is a
compile-time error the same way importing `useState` into one would be —
that's React's own rule, not a Kbach limitation.

`root`/`theme`/`config`/`include`/`safelist` options all match
`@kbach/react/vite`'s exactly (see `KbachPluginOptions`, above) — `root`
additionally defaults to `process.cwd()` rather than a bundler-resolved
project root, since PostCSS has no equivalent to Vite's own resolved
`root` to read; pass it explicitly if your `postcss.config.js` doesn't
live at your project root (e.g. a monorepo app).

## Dark mode

**Following the OS setting — zero setup.** `dark:` classes already work,
via plain CSS, with nothing to configure:

```tsx
<div className="bg-white dark:bg-neutral-12">...</div>
```

**A manual light/dark toggle — one file, no other setup.** `@media
(prefers-color-scheme)` (the default above) can't be flipped by a button —
it only ever reflects the OS. For a real toggle, add one file:

```js
// kbach.config.js — at your project root
export default { darkMode: 'attribute' };
```

That's it. Don't pass anything to `kbach()`/`'@kbach/react/postcss'` and
don't call anything at app startup — both sides pick this up on their own
(the plugin auto-discovers the file; the runtime reads the strategy back
out of the CSS the plugin already generated). Then just use `useTheme()`:

```tsx
import { useTheme } from '@kbach/react';

function ThemeToggle() {
  const { mode, toggle } = useTheme();
  return <button onClick={toggle}>{mode}</button>;
}
```

Works anywhere in the tree, no provider required. `<ThemeProvider
defaultMode="dark">` is optional, only for seeding a startup default.
Outside React, use `getGlobalDarkMode()`/`toggleGlobalDarkMode()` directly.

<details>
<summary>Not using the static plugin, or need to set the strategy explicitly?</summary>

There's nothing for the runtime to auto-detect if no build step ever
generates `dark:` CSS (a pure runtime `kb()`-only setup) — call
`applyKbachConfig()` yourself once, before your first render, instead:

```tsx
import { applyKbachConfig } from '@kbach/react';

applyKbachConfig({ darkMode: 'attribute' });
```

An explicit call like this always wins over whatever the CSS auto-detect
found, if the two ever disagree. If you do reach for it alongside the
plugin, import the same `kbach.config.js` rather than retyping the value —
`import kbachConfig from '../kbach.config.js'; applyKbachConfig(kbachConfig);`.

`useTheme()`/`toggleGlobalDarkMode()` still track `isDark` correctly under
the default `'media'` strategy too, with none of the above — they just
won't visibly affect `dark:` classes until the runtime knows about
`'class'`/`'attribute'` one way or another.

</details>

## Theming

```ts
import { setTheme, defaultTheme } from '@kbach/react';

setTheme({
  ...defaultTheme,
  colors: { ...defaultTheme.colors, brand: '#ff6b35' },
});
```

## Dynamic classes

Classes that appear literally in your source are resolved at build time.
For classes assembled from truly dynamic data, use `kb()` — this is the
one thing in this package that genuinely calls into the WASM engine at
runtime, so `await initKbach()` once at startup before the first `kb()`
call (or before rendering, if you can't guarantee it runs first otherwise):

```ts
import { initKbach, kb } from '@kbach/react';

await initKbach();
const className = kb(`bg-${userColor}-6`);
```

Prefer a `safelist` entry in the plugin config when the possible values are
known ahead of time — keeps everything static, no `initKbach()` needed.

## Reading colors as values

For anywhere you need a real color, not a `className` (an SVG `fill`, a
chart library prop):

```tsx
import { useColors } from '@kbach/react';

const colors = useColors();
colors.blue[6];       // '#2563eb' — static, same value in both modes
colors.blue['6/50'];  // same, at 50% opacity
colors.surface;       // 'rgb(var(--kb-color-surface))' if defined as light/dark
```

Any color — a shade-family entry like `blue-6` or a standalone name like
`surface` — can be defined in the theme as a plain string (static) or a
`{ light, dark }` pair, fully manual:

```ts
setTheme({
  ...defaultTheme,
  colors: { ...defaultTheme.colors, surface: { light: '#f9fafb', dark: '#111827' } },
});
```

A plain color always resolves to its literal value. A `{ light, dark }`
color resolves to a live CSS variable instead of a fixed hex — it stays
correct across theme changes with zero re-render.

## License

MIT
