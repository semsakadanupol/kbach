# @kbach/react

A utility-first styling engine for React, powered by a real Rust/WASM core.
Kbach aims for full [Tailwind CSS v4](https://tailwindcss.com) feature
parity — grid, transforms, filters, gradients, animations, container
queries, arbitrary values, and a parameterized variant system (`has-*`,
`data-*`, `aria-*`, `not-*`, generalized `group-*`/`peer-*`, and more) — with
its own 22-family + metals color palette as the one deliberate difference.

> **Beta.** The API is close to stable but may still change before `1.0.0`.
> Feedback and issues are very welcome.

## Why Kbach

- **A real engine, not a lookup table.** Every class is resolved by the same
  Rust/WASM core at build time (via the Vite plugin) and at runtime (via
  `kb()`), so build-time and runtime output can never drift apart.
- **Static by default.** The Vite plugin scans your source and writes a real,
  plain `kbach.css` file — no runtime style injection needed, no
  flash-of-unstyled-content, no client-side CSS-in-JS overhead.
- **Dark mode that works without a provider.** Toggle/set/subscribe to dark
  mode from anywhere — a plain function, an event handler, a component that
  never wants React Context — with an optional `<ThemeProvider>` as a thin
  wrapper around the exact same store.
- **Composable by nature.** Utility class strings are just strings — combine
  them with plain arrays, ternaries, or template literals. No bespoke
  composition API required.

## Installation

```sh
npm install @kbach/react
```

## Quick start

Add the Vite plugin so your utility classes are resolved to real CSS at
build time:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/react/vite';

export default defineConfig({
  plugins: [kbach(), react()],
});
```

Create `src/kbach.css` with the markers the plugin writes between, and
import it once:

```css
/* src/kbach.css */
/* kbach:start */
/* kbach:end */
```

```tsx
// main.tsx
import { initKbach } from '@kbach/react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './kbach.css';

initKbach().then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
```

Then just use utility classes:

```tsx
<div className="flex items-center gap-4 bg-blue-6 text-white p-4 rounded-lg">
  Hello Kbach
</div>
```

## Dark mode

Works standalone, with zero provider:

```tsx
import { useGlobalDarkMode, toggleGlobalDarkMode } from '@kbach/react';

function ThemeToggle() {
  const isDark = useGlobalDarkMode();
  return <button onClick={toggleGlobalDarkMode}>{isDark ? 'Dark' : 'Light'}</button>;
}
```

Or opt into the optional `<ThemeProvider>` / `useTheme()` pair — both read
and write the exact same global store, so they always stay in sync with the
standalone functions above:

```tsx
import { ThemeProvider, useTheme } from '@kbach/react';

function Toggle() {
  const { mode, isDark, setMode, toggle } = useTheme();
  return <button onClick={toggle}>{mode}</button>;
}

<ThemeProvider defaultMode="system">
  <Toggle />
</ThemeProvider>;
```

## Theming

Customize the color palette, spacing scale, breakpoints, and dark-mode
strategy via `setTheme()` (call once, before your first render) — the same
theme object is used by both the runtime and the Vite plugin, so the two
never fall out of sync:

```ts
import { setTheme, defaultTheme } from '@kbach/react';

setTheme({
  ...defaultTheme,
  colors: { ...defaultTheme.colors, brand: '#ff6b35' },
});
```

## Runtime & dynamic classes

Every class name that appears literally in your source is resolved at build
time. For a class name assembled from truly dynamic data (e.g. user input)
with no static occurrence anywhere in your source, call `kb()` — it resolves
and injects the CSS at runtime and returns the class name unchanged:

```ts
import { kb } from '@kbach/react';

const className = kb(`bg-${userColor}-6`);
```

If you're using the static build (the default with the Vite plugin), prefer
a `safelist` entry in the plugin config for known-but-dynamic values instead
— it keeps everything static with zero runtime cost.

## License

MIT
