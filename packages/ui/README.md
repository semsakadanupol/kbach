# @kbach/ui

Tailwind-like utility classes for React — web, React Native, and Expo. Write `className` strings once; a custom JSX runtime resolves them at render time on every platform. An optional Vite plugin outputs a static `kbach.css` for zero runtime cost on web.

```jsx
<div className="bg-white dark:bg-gray-10 p-4 rounded-xl shadow" />
<div className="bg-blue-7 hover:bg-blue-8 dark:bg-indigo-6 rounded-lg px-6 py-3" />
```

[npm package](https://www.npmjs.com/package/@kbach/ui)

## Setup

```
npm install @kbach/ui
```

### JSX runtime (always required)

**tsconfig.json:**

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@kbach/ui" } }
```

That's the only setting needed — Vite, Next.js, and React Router all read it. Don't *also* set `jsxImportSource` on a bundler plugin (e.g. `@vitejs/plugin-react`); one source of truth avoids conflicts.

### Which setup do I need?

| Framework | Use |
|---|---|
| Vite, React Router library mode, CRA, other Vite-based | **[Static CSS](#static-css)** (recommended) — zero runtime cost, catches typos at build time |
| React Router, framework mode | **[Static CSS](#static-css)** — and skip `@vitejs/plugin-react`, see note below |
| Next.js | **[Next.js](#nextjs)** — Runtime setup, plus one App Router-specific detail |
| React Native, Expo | **[React Native / Expo](#react-native--expo)** — different setup entirely (Babel preset, not the JSX runtime step above) |

### Static CSS

Vite only, and the recommended setup for any Vite-based app — a build-time plugin writes real CSS into a file you import at build time, so nothing is generated client-side and there's zero runtime cost. Three pieces, all required:

**1. Add the plugin:**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { kbach } from '@kbach/ui/vite';

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

This import is what actually switches the app over to Static CSS — the plugin alone only generates the file; without importing it, runtime injection stays active and you get both at once.

**3. Wrap your app — no `<KbachReset />` here, `kbach.css` already includes the base reset:**

```jsx
import { ThemeProvider } from '@kbach/ui';

export default function Root() {
  return <ThemeProvider defaultMode="system"><App /></ThemeProvider>;
}
```

Done. The plugin scans your source at build time and writes CSS between the markers, and warns in the terminal (with a clickable `file:line`) for any class it doesn't recognize — usually a typo.

Using a custom `kbach.config.js`? See [Wiring a custom config in](#wiring-a-custom-config-in) below — it needs to be passed in twice for Static CSS specifically.

**React Router framework mode:** don't add `@vitejs/plugin-react` — `reactRouter()` already provides JSX handling, and both together crash the page (`Identifier 'RefreshRuntime' has already been declared`).

```ts
// vite.config.ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import { kbach } from '@kbach/ui/vite'; // omit if using Runtime setup instead

export default defineConfig({ plugins: [kbach(), reactRouter()] });
```

(React Router library mode — `createBrowserRouter`, no SSR — has no such conflict; set it up like any Vite + React app.)

### Runtime

Client-side CSS injection — works with any bundler (Vite, webpack, Turbopack, Metro-for-web, …), no build plugin. Next.js always uses this, or use it on Vite if you'd rather not wire up the plugin yet:

```jsx
import { ThemeProvider, KbachReset } from '@kbach/ui';

export default function Root() {
  return (
    <ThemeProvider defaultMode="system">
      <KbachReset />
      <App />
    </ThemeProvider>
  );
}
```

That's it — done. `<KbachReset />` renders the base reset as real markup instead of waiting on client JS — matters most for SSR, where it avoids a flash of unstyled browser defaults before hydration.

Using a custom `kbach.config.js`? Pass it to `ThemeProvider` — see [Wiring a custom config in](#wiring-a-custom-config-in).

Don't also set up Static CSS above in the same app — pick one.

### Next.js

Always [Runtime setup](#runtime) above — Static CSS doesn't apply (webpack/Turbopack, not Vite). The `tsconfig.json` step from [Setup](#setup) applies as-is; SWC reads `jsxImportSource` the same way Vite does.

The one Next.js-specific detail: render `<KbachReset />` once in the root App Router `layout.tsx`:

```jsx
// app/layout.tsx
import { ThemeProvider, KbachReset } from '@kbach/ui';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider defaultMode="system">
          <KbachReset />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Without it, expect a flash of raw browser defaults on first paint until hydration completes. `@kbach/ui`'s compiled output ships its own `"use client"` directive, so App Router Server Components can use `className`, `styled()`, hooks, `<ThemeProvider>`, and `<KbachReset>` directly — no manual `'use client'` wrapper needed.

### React Native / Expo

Same `npm install @kbach/ui` — no separate package. Everything else (API, modifiers, color system) is the same import as web; only setup differs.

**1. babel.config.js:**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
      '@kbach/ui/babel',
    ],
  };
};
```

Or the one-liner helper: `const { createKbachConfig } = require('@kbach/ui/native'); module.exports = createKbachConfig();`. After changing this file, clear the Metro cache: `npx expo start --clear`.

**2. Wrap your app:**

```jsx
import { ThemeProvider } from '@kbach/ui';

export default function App() {
  return (
    <ThemeProvider defaultMode="system">
      <AppContent />
    </ThemeProvider>
  );
}
```

`ThemeProvider` auto-detects React Native at render time and reads `useColorScheme()`/`useWindowDimensions()` automatically — same import as web, no `/native` subpath needed.

A handful of utilities are native-only or web-only, and Expo Web/React Native Web has its own notes — see [KBACH.md](./KBACH.md#native-only-utilities) for the full platform-differences reference.

### Wiring a custom config in

`kbach.config.js` isn't picked up automatically — it has to be passed in explicitly, and **where** depends on what it affects:

- **Runtime** (dark mode, `useColors()`, animations) — needed by every setup above, pass it to `ThemeProvider`:
  ```jsx
  import { ThemeProvider } from '@kbach/ui';
  import kbachConfig from '../kbach.config';

  <ThemeProvider defaultMode="system" config={kbachConfig}><App /></ThemeProvider>
  ```
- **Build-time** (what the Vite plugin scans against) — only for [Static CSS](#static-css), pass it to the plugin:
  ```ts
  import { kbach } from '@kbach/ui/vite';
  import kbachConfig from './kbach.config';

  export default defineConfig({ plugins: [kbach(kbachConfig)] });
  ```

Skipping the runtime one under Static CSS is an easy mistake — the generated `kbach.css` looks correct, but dark mode/`useColors()`/animations silently fall back to defaults since nothing told the running app what you customized.

## More information

[kbach-ui.md](./kbach-ui.md) — the complete reference: `ThemeProvider`/`useTheme`/dark mode, the full API (`styled`, `cx`, `useStyles`, `kb`, `useColors`, typed theme tokens), every modifier, the color system, CSS resets, and all `kbach.config.js` options — covers web and React Native/Expo.

`@kbach/native` is deprecated and no longer maintained — its last published npm version is frozen as a compatibility shim re-exporting this package. Install `@kbach/ui` directly for new projects.
