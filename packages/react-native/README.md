# @kbach/react-native

Utility-class styling for React Native — the same class names as
[`@kbach/react`](https://www.npmjs.com/package/@kbach/react), resolved to a
`StyleSheet`-ready style object instead of CSS.

> **Beta.** Native is Android-only (no iOS bridge yet). Ships a prebuilt
> native module — no Rust toolchain or manual linking.

## Install

```sh
npm install @kbach/react-native@beta
```

## Setup

| Target | What to do |
| :-- | :-- |
| **Expo Go** | Nothing. A pure-JS fallback engine loads automatically. |
| **Expo Web** / `react-native-web` | Nothing. Resolves through the same CSS engine `@kbach/react` uses. |
| **Expo dev client / prebuild / EAS** | Add the babel plugin (below), then `npx expo prebuild && npx expo run:android`. |
| **React Native CLI** | Add the babel plugin (below), then rebuild the app. |

The babel plugin, added to your existing `babel.config.js`:

```js
// Expo — keep the function form your project already has:
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@kbach/react-native/babel-plugin'],
  };
};
```

```js
// React Native CLI:
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['@kbach/react-native/babel-plugin'],
};
```

Then write classes:

```tsx
import { View, Text } from 'react-native';

<View className="flex-1 items-center justify-center bg-white dark:bg-black">
  <Text className="text-lg font-bold">Hello Kbach</Text>
</View>;
```

## Theme

Optional. Create `kbach.config.js` at your project root — the babel plugin
picks it up automatically, no import or `applyKbachConfig()` call needed:

```js
// kbach.config.js
module.exports = {
  extend: {
    colors: {
      brand: '#ff6b35',
      surface: 'gray-2',
      dark: { surface: 'gray-11' }, // makes `bg-surface` mode-aware
    },
  },
};
```

It's plain JavaScript — **quote any key containing a hyphen**
(`'surface-dim': '#121318'`).

Full config reference (colors, spacing, breakpoints, fonts, dark mode) is
in [AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

## Dark mode

Zero setup on every target. `dark:` classes react to the OS setting;
`useTheme()` gives you a manual toggle:

```tsx
import { useTheme } from '@kbach/react-native';

const { mode, isDark, setMode, toggle } = useTheme();
```

Works anywhere, no provider. `<ThemeProvider>` is optional — for seeding a
startup default and opt-in persistence (`<ThemeProvider persist={AsyncStorage}>`).

## Colors as values

For a real color string rather than a class — a chart prop, a shadow color:

```tsx
import { useColors } from '@kbach/react-native';

const colors = useColors();
colors.blue[6];        // '#2563eb'
colors.blue['6/50'];   // same at 50% opacity
colors.get('brand');   // a custom color, typed as plain `string`
```

## What differs on native

React Native has no CSS cascade, so a fixed subset of modifiers is
supported — `dark:`, `sm:`–`2xl:`, `active:`, `hover:`, `focus:`,
`disabled:`, and `data-[…]:`/`aria-[…]:`. `group-*`/`peer-*`/`has-[…]` and
container queries parse without error but do not apply. When two classes
set the same property the more-specific one wins regardless of source
order (`dark:bg-black bg-white` → black in dark mode).

Expo Go covers a documented subset of utilities (no grid, filters,
gradients, or DOM-only typography). Expo Web and a real dev-client build
cover the full set.

See [AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md)
for the complete reference — modifier list, `calc()`/`min()`/`max()`
support, dynamic tokens, monorepo setup, and how the engine works.

## License

MIT
