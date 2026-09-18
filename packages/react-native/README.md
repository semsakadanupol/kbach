# @kbach/react-native

Utility-class styling for React Native — the same class names as
[`@kbach/react`](https://www.npmjs.com/package/@kbach/react), resolved to a
`StyleSheet`-ready style object instead of CSS.

> **Beta.** Native is Android-only (no iOS bridge yet) — on iOS, every
> build (dev client, CLI, EAS) runs the same reduced-coverage JS-fallback
> engine as Expo Go, not the full native engine. Ships a prebuilt native
> module — no Rust toolchain or manual linking.

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
| **React Native CLI** | Add the babel plugin (below), then restart Metro with `--reset-cache` and rebuild the app. |

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

A plain JS reload isn't enough after adding the plugin or editing
`kbach.config.js` — Metro's transform cache doesn't reliably pick up a
babel config change on its own. Restart with `--reset-cache` (`npx
react-native start --reset-cache` / `npx expo start --clear`).

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
Mount at most one — a second instance logs a dev warning, since dark mode
is one global store, not scoped per provider.

## Dynamic values

For a value that changes at runtime without touching component state —
a live accent color, a user-picked theme:

```tsx
import { setDynamicToken, useDynamicToken } from '@kbach/react-native';

setDynamicToken('accent', '#8b5cf6');

<View className="bg-[var(--accent)]" />; // updates instantly, everywhere it's used
const accent = useDynamicToken('accent'); // '#8b5cf6' | undefined, reactive
```

Call `setDynamicToken` from a component's own render (guarded to fire
once), not from module top-level — see
[AGENTS.md §8](https://github.com/semsakadanupol/kbach/blob/main/packages/react-native/AGENTS.md)
for why and the exact pattern.

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

`hover:` only fires for pointer-capable input (mouse/trackpad) — it's
inert on pure touch, so don't expect it to do anything on a phone/tablet
with no attached pointer.

`disabled:`/`aria-[…]:`/`data-[…]:` read that exact element's own props —
never a parent's, since there's no `group-disabled:`-style cascade to
inherit through. `<Pressable disabled><Text className="disabled:text-gray-5">`
does nothing to the `Text`, silently, because `Text` never received a
`disabled` prop of its own; the prop has to be repeated on whichever
element the modifier is written on:
`<Pressable disabled><Text disabled className="disabled:text-gray-5">`.

Expo Go, and iOS in ANY build type (no native engine there yet — see the
callout at the top), cover the same documented subset of utilities (no
grid, filters, gradients, or DOM-only typography). Expo Web and a real
**Android** dev-client/CLI build cover the full set.

A malformed or misused value fails safely — a deduped, dev-only
`console.warn` naming the offending class and the fix, never a crash or
silently-wrong output. Confirmed across CSS-injection attempts, invalid
`calc()` operands, and double-mounting.

`clsx()` — this package's own bundled copy, `import { clsx } from
'@kbach/react-native'` — composes conditional class strings the same way
the standalone `clsx` package does. You don't need it for `dark:`/`sm:`/
etc. (those work as plain classes), but it's there for `isActive &&
'bg-blue-6'`-style composition.

See [this package's own AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/packages/react-native/AGENTS.md)
for the complete reference — modifier list, `calc()`/`min()`/`max()`/
`clamp()` support, dynamic tokens, monorepo setup, and failure modes; see
the [root AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md)
for `kbach.config.js` and how the underlying engine is built.

## License

MIT
