# Kbach

Tailwind-like utility classes for **React** and **React Native** -- same API, same classes, both platforms.

```tsx
// Works on web and native, on any component including third-party
<View className="bg-white dark:bg-gray-10 p-4 rounded-xl" />
<View className="bg-blue-6 pressed:bg-blue-8 dark:bg-indigo-6 rounded-lg p-3" />
<View className="bg-[#6366f1] p-[14px] rounded-[20px]" />
```

---

## Contents

- [How it works](#how-it-works)
- [Setup](#setup)
- [ThemeProvider](#themeprovider)
- [Hooks](#usetheme)
- [Styling APIs](#styling-apis)
- [Class reference](#class-reference)
- [Configuration](#configuration)

---

## How it works

Kbach intercepts every JSX element through a custom JSX runtime and converts `className` props to `style` objects at render time. A Babel plugin pre-resolves static strings at build time so they cost nothing at runtime. An LRU cache handles dynamic strings.

```
className="bg-white dark:bg-gray-10 p-4"
    |  Babel (static path -- zero runtime cost)
    |  OR jsx-runtime (dynamic path -- LRU cached)
    v
style={{ backgroundColor: '#fff', padding: 16 }}   <- native
className="bg-white dark:bg-gray-10 p-4" + <style> <- web
```

`@kbach/react`'s runtime output ships its own `"use client"` directive, so Next.js App Router Server Components can use `className`, `styled()`, hooks, and `<ThemeProvider>` without adding `"use client"` themselves.

---

## Setup

Kbach ships as two packages, one per platform:

| Package | Platform | Setup guide | npm |
|---|---|---|---|
| `@kbach/react` | React web | [README](packages/react/README.md) | [npmjs.com/package/@kbach/react](https://www.npmjs.com/package/@kbach/react) |
| `@kbach/native` | React Native / Expo | [README](packages/native/README.md) | [npmjs.com/package/@kbach/native](https://www.npmjs.com/package/@kbach/native) |

Follow the README for whichever platform you're targeting -- it has the full install and configuration steps.

---

## ThemeProvider

Wrap your entire app once. Manages light/dark/system mode, persists the choice, and listens to system changes automatically.

```tsx
<ThemeProvider
  defaultMode="system"        // 'light' | 'dark' | 'system'  (default: 'system')
  disablePersistence={false}  // set true to skip localStorage / AsyncStorage
>
  {children}
</ThemeProvider>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `defaultMode` | `'light' \| 'dark' \| 'system'` | `'system'` | Starting mode |
| `disablePersistence` | `boolean` | `false` | Skip saving the choice |
| `config` | `FrameworkConfig` | global config | Override config for this subtree |

### useTheme()

Access and control the theme from any component inside `ThemeProvider`.

```tsx
// web
import { useTheme } from '@kbach/react';
// native
import { useTheme } from '@kbach/native';

function Header() {
  const { mode, resolvedMode, isDark, setMode, toggle } = useTheme();

  return (
    <View className="flex-row items-center justify-between p-4">
      <Text className="text-gray-10 dark:text-white font-bold">My App</Text>
      <TouchableOpacity onPress={toggle}>
        <Text>{isDark ? 'Light' : 'Dark'}</Text>
      </TouchableOpacity>
    </View>
  );
}
```

| Value | Type | Description |
|---|---|---|
| `mode` | `'light' \| 'dark' \| 'system'` | User-selected mode |
| `resolvedMode` | `'light' \| 'dark'` | Actual mode after resolving `'system'` |
| `isDark` | `boolean` | Shorthand for `resolvedMode === 'dark'` |
| `setMode(mode)` | `fn` | Set mode explicitly |
| `toggle()` | `fn` | Toggle between light and dark |
| `config` | `ResolvedConfig` | Full resolved config (theme, darkMode, plugins) |

### useIsDark()

Shorthand hook when you only need the dark-mode boolean — avoids destructuring `useTheme()`.

```tsx
import { useIsDark } from '@kbach/react'; // or '@kbach/native'

const isDark = useIsDark();
```

### useColors()

Returns the active theme color palette as a smart proxy. Values match exactly what `bg-`, `text-`, `border-`, and other color utilities resolve to.

```tsx
import { useColors } from '@kbach/react'; // or '@kbach/native'

const colors = useColors();

// Shade access
colors.blue[6]           // '#3b82f6'
colors.red[11]           // '#450a0a'

// Shade + opacity — number 0–100
colors.blue['6/50']      // 'rgba(59,130,246,0.5)'
colors.slate['3/10']     // 'rgba(226,232,240,0.1)'

// Flat colors
colors.white             // '#ffffff'
colors.transparent       // 'transparent'

// Flat color + opacity
colors['white/20']       // 'rgba(255,255,255,0.2)'
colors['black/80']       // 'rgba(0,0,0,0.8)'

// Arbitrary CSS color with opacity
colors.alpha('#ff6b35', 60)           // 'rgba(255,107,53,0.6)'
colors.alpha('rgb(100,200,100)', 30)  // 'rgba(100,200,100,0.3)'
```

Useful for chart libraries, Animated API, or any third-party component that needs raw color values instead of class strings.

---

## Styling APIs

### className prop (recommended)

The primary way to style. Works on any HTML element or React Native component via the custom JSX runtime.

```tsx
<View className="bg-white dark:bg-gray-10 p-4 rounded-xl" />
<Text className="text-gray-10 dark:text-white text-lg font-bold" />
<TouchableOpacity className="bg-blue-6 pressed:bg-blue-8 rounded-lg p-3" />
```

### styled()

Create a pre-styled component from any base component. Handles interaction states automatically.

```tsx
import { styled } from '@kbach/native'; // or '@kbach/react'
import { View, Text, TouchableOpacity, TextInput } from 'react-native';

const Card = styled(View, 'bg-white dark:bg-gray-9 rounded-2xl p-6 shadow');

const Title = styled(Text, 'text-2xl font-bold text-gray-10 dark:text-white');

const Button = styled(
  TouchableOpacity,
  'bg-blue-7 pressed:bg-blue-8 dark:bg-indigo-6 dark:pressed:bg-indigo-7 rounded-xl px-6 py-3'
);

const Input = styled(
  TextInput,
  'border border-gray-4 dark:border-gray-7 focus:border-blue-6 bg-white dark:bg-gray-8 rounded-lg px-4 py-3'
);
```

Pass additional classes at use time with the `kb` prop:

```tsx
<Card kb="mt-4 mb-2">
  <Title kb="text-3xl">Hello</Title>
</Card>
```

### useStyles()

Resolve classes imperatively inside a component. Useful when you need a style object for the `style` prop.

```tsx
import { useStyles } from '@kbach/native'; // or '@kbach/react'
import { View, Text } from 'react-native';

function Badge() {
  const containerStyle = useStyles('bg-blue-6 dark:bg-indigo-6 px-3 py-1 rounded-full');
  const textStyle = useStyles('text-white text-xs font-bold');

  return (
    <View style={containerStyle}>
      <Text style={textStyle}>New</Text>
    </View>
  );
}
```

### kb()

Resolve classes outside of a component, for use in `StyleSheet.create()` or static contexts.

```tsx
import { StyleSheet } from 'react-native';
import { kb } from '@kbach/native'; // or '@kbach/react'

const styles = StyleSheet.create({
  container: kb('flex-1 bg-white p-4') as object,
  title: kb('text-2xl font-bold text-gray-10') as object,
});
```

### cx()

Conditionally join class names. Falsy values are safely ignored.

```tsx
import { cx } from '@kbach/native'; // or '@kbach/react'

<View className={cx(
  'p-4 rounded-xl',
  isSelected && 'border-2 border-blue-6',
  isDisabled && 'opacity-50',
)} />
```

---

## Class reference

### Modifiers

Up to **3 modifiers** can be chained in any order.

| Modifier | Trigger |
|---|---|
| `dark:` | Dark mode active |
| `light:` | Light mode active |
| `hover:` | Mouse hover (web) |
| `pressed:` | Touch/click pressed (native + web) |
| `focus:` | Element focused |
| `active:` | Element active |
| `disabled:` | Element disabled |

```tsx
// Single
<View className="dark:bg-gray-10" />

// Chained (up to 3)
<View className="dark:hover:bg-gray-9" />
<View className="dark:pressed:bg-indigo-8" />
```

### Group / peer (web only)

Mark a parent with `group`, then style children based on its state with `group-hover:`/`group-focus:`. Mark a preceding sibling with `peer` for `peer-hover:`/`peer-focus:` the same way.

```tsx
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
```

Nested groups need names, or an inner element reacts to whichever `.group` is nearest — not necessarily the one you meant. Name the marker (`group/{name}`) and the modifier (`group-hover/{name}:`) to scope it to that specific ancestor — same for `peer/{name}` + `peer-hover/{name}:`/`peer-focus/{name}:`.

```tsx
<div className="group/card">
  <div className="group/icon">
    <span className="group-hover/icon:opacity-100" /> {/* only the inner group */}
  </div>
  <span className="group-hover/card:underline" />      {/* only the outer group */}
</div>
```

### Arbitrary values

Use `[value]` for any value not in the default theme.

```tsx
<View className="bg-[#6366f1]" />
<View className="p-[14px]" />
<View className="text-[18px]" />
<View className="rounded-[20px]" />
<View className="bg-[rgba(99,102,241,0.15)]" />
```

### Negative values

Prefix any spacing utility with `-` for negative values.

```tsx
<View className="-mt-4" />    {/* marginTop: -16 */}
<View className="-mx-2" />    {/* marginHorizontal: -8 */}
```

### Color with opacity

Use `/` after a color to set opacity.

```tsx
<View className="bg-blue-6/50" />    {/* 50% opacity */}
<View className="bg-gray-10/75" />   {/* 75% opacity */}
```

### Common utilities

| Category | Examples |
|---|---|
| **Background** | `bg-white`, `bg-gray-10`, `bg-blue-6`, `bg-[#fff]` |
| **Text** | `text-sm`, `text-lg`, `text-2xl`, `text-gray-10`, `font-bold`, `font-semibold` |
| **Padding** | `p-4`, `px-6`, `py-3`, `pt-2`, `pb-4` |
| **Margin** | `m-4`, `mx-auto`, `mt-2`, `mb-4`, `-mt-4` |
| **Size** | `w-full`, `h-12`, `w-[200px]`, `min-w-0` |
| **Flex** | `flex-1`, `flex-row`, `items-center`, `justify-between`, `gap-4` |
| **Border** | `border`, `border-2`, `border-gray-4`, `rounded-xl`, `rounded-full` |
| **Shadow** | `shadow`, `shadow-md`, `shadow-lg` |
| **Opacity** | `opacity-50`, `opacity-75` |

---

## Configuration

Create a `kbach.config.js` at the project root to customize the theme or add utilities.

```js
// kbach.config.js
module.exports = {
  // Dark mode strategy:
  //   'attribute' -> sets data-theme="dark" on <html>  (default)
  //   'class'     -> toggles .dark / .light on <html>
  //   'media'     -> respects prefers-color-scheme only (no manual toggle)
  darkMode: 'attribute',

  theme: {
    // Replace entire color palette
    colors: {
      brand: {
        1: '#eff6ff',
        6: '#3b82f6',
        10: '#1e3a5f',
      },
    },
  },

  extend: {
    theme: {
      // Add to the palette without replacing defaults
      colors: {
        brand: {
          6: '#6366f1',
        },
      },
      spacing: {
        18: '72px',
        22: '88px',
      },
    },
  },

  plugins: [
    ({ addUtility, addVariant, theme }) => {
      // Register a custom utility
      addUtility('border-brand', {
        borderColor: theme('colors.brand.6'),
        borderWidth: 2,
      });

      // Register a custom modifier (web CSS selector)
      addVariant('selected', '&[aria-selected="true"]');
    },
  ],
};
```

### How the config reaches the runtime

**React Native / Expo** — handled automatically. The Babel plugin reads `kbach.config.js` at compile time for static class pre-resolution, and also injects a one-time `updateConfig()` call into every transformed file so the runtime (dynamic classes, `useColors()`, dark mode strategy) sees the same config.

**React web** — no Babel plugin runs at runtime, so you need to wire it up once in your app entry:

```tsx
// src/main.tsx (or index.tsx) — import BEFORE anything renders
import { updateConfig } from '@kbach/react';
import kbachConfig from '../kbach.config.js';

updateConfig(kbachConfig);
```

Or pass it directly to `ThemeProvider` so it's scoped to that subtree:

```tsx
import kbachConfig from '../kbach.config.js';

<ThemeProvider config={kbachConfig}>
  <App />
</ThemeProvider>
```

---

## Monorepo structure

```
packages/
  react         -- @kbach/react: core engine, components, hooks, JSX runtime (web)
  native        -- @kbach/native: everything in react + Metro/Babel setup (native)
```

### Scripts

```bash
npm run build   # build all packages
npm run dev     # watch mode (all packages in parallel)
npm run test    # run tests
npm run lint    # TypeScript type check
npm run clean   # delete all dist/ folders and node_modules
```

### Publishing

`@kbach/react` and `@kbach/native` are always version-locked — every publish script
bumps both packages' version in lockstep (via `npm version patch --workspaces`),
even when only one of them is actually uploaded to npm, so the two `package.json`
versions never drift apart.

```bash
npm run publish:react   # bump both, build @kbach/react, publish @kbach/react only
npm run publish:native  # bump both, build @kbach/native (and its @kbach/react dependency), publish @kbach/native only
npm run publish:all     # bump both, build everything, publish both
```
