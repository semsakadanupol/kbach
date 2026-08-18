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

```tsx
<div className="flex items-center gap-4 bg-blue-6 text-white p-4 rounded-lg">
  Hello Kbach
</div>
```

## Dark mode

```tsx
import { useTheme } from '@kbach/react';

function ThemeToggle() {
  const { mode, isDark, setMode, toggle } = useTheme();
  return <button onClick={toggle}>{mode}</button>;
}
```

Works anywhere, no provider needed. `<ThemeProvider defaultMode="dark">` is
optional, for seeding a startup default. Outside React (plain functions,
event handlers), use `getGlobalDarkMode()`/`toggleGlobalDarkMode()` instead.

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
For classes assembled from truly dynamic data, use `kb()`:

```ts
import { kb } from '@kbach/react';

const className = kb(`bg-${userColor}-6`);
```

Prefer a `safelist` entry in the plugin config when the possible values are
known ahead of time — keeps everything static.

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
