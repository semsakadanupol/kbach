# @kbach/native

Tailwind-like utility classes for React Native and Expo. One package: core engine, JSX runtime, Babel preset. Classes are `className` strings, resolved to inline styles at render time.

```jsx
import { View, Text, TouchableOpacity } from 'react-native';
import { styled } from '@kbach/native';

const Button = styled(
  TouchableOpacity,
  'bg-blue-7 pressed:bg-blue-8 dark:bg-indigo-6 rounded-xl px-6 py-3 items-center'
);

export default function Screen() {
  return (
    <View className="flex-1 bg-gray-2 dark:bg-gray-11 p-4">
      <Text className="text-2xl font-bold text-gray-10 dark:text-white mb-4">
        Hello Kbach
      </Text>
      <Button>
        <Text className="text-white font-semibold">Press me</Text>
      </Button>
    </View>
  );
}
```

## Install

```
npm install @kbach/native
```

[npm package](https://www.npmjs.com/package/@kbach/native)

## Setup

**1. babel.config.js:**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      'babel-preset-expo',
      '@kbach/native/babel',
    ],
  };
};
```

Or the one-liner helper: `const { createKbachConfig } = require('@kbach/native'); module.exports = createKbachConfig();` — identical result. Merging into an existing config: `withKbachBabel({ presets: [...], plugins: [...] })`. After changing this file, clear the Metro cache: `npx expo start --clear`.

**2. Wrap your app:**

```jsx
import { ThemeProvider } from '@kbach/native';

export default function App() {
  return (
    <ThemeProvider defaultMode="system">
      <AppContent />
    </ThemeProvider>
  );
}
```

Reads `useColorScheme()`/`useWindowDimensions()` automatically — no extra props needed.

## Dark mode

`<ThemeProvider>` powers every `dark:` class — detects OS color scheme, persists the user's choice (`AsyncStorage`), re-renders on change.

| Prop | Type | Default | Description |
|---|---|---|---|
| `defaultMode` | `'light' \| 'dark' \| 'system'` | `'system'` | Starting mode |
| `disablePersistence` | `boolean` | `false` | Skip saving to `AsyncStorage` |
| `config` | `FrameworkConfig` | global config | Scope a different config to this subtree |

`darkMode` in `kbach.config.js` picks the matching strategy: `'attribute'` (default), `'class'`, or `'media'` (system-only). Toggle it with `useTheme()`'s `toggle()`/`setMode()` — see [API](#api).

## API

### className / kb

Works on any React Native component — `View`, `Text`, `TouchableOpacity`, `TextInput`, third-party components.

```jsx
<TouchableOpacity className="bg-blue-7 pressed:bg-blue-8 rounded-xl px-6 py-3" />
```

### styled(Component, classes)

Handles interaction states (`pressed:`, `focus:`, etc.) automatically. Extra classes at use time via `kb`.

```jsx
import { styled } from '@kbach/native';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';

const Card = styled(View, 'bg-white dark:bg-gray-9 rounded-2xl p-6 shadow');
const Button = styled(TouchableOpacity, 'bg-blue-7 pressed:bg-blue-8 dark:bg-indigo-6 rounded-xl px-6 py-3');
const Input = styled(TextInput, 'border border-gray-4 focus:border-blue-6 bg-white rounded-lg px-4 py-3');

<Card kb="mt-4 mb-2">
  <Button kb="w-full" />
</Card>
```

### cx(...classes)

```jsx
import { cx } from '@kbach/native';

<View className={cx('p-4 rounded-xl border', isSelected ? 'border-blue-6' : 'border-gray-3', isDisabled && 'opacity-50')} />
```

### useStyles(classes, state?)

```jsx
const containerStyle = useStyles('bg-blue-6 dark:bg-indigo-6 px-3 py-1 rounded-full');
const style = useStyles('bg-blue-5 pressed:bg-blue-7 rounded-lg', { pressed });
```

### kb(classes)

Resolve outside a component — for `StyleSheet.create()`:

```js
import { kb } from '@kbach/native';

const styles = StyleSheet.create({
  container: kb('flex-1 bg-white p-4') as object,
});
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

Chain in any order: `<View className="dark:sm:pressed:bg-blue-8" />`

| Category | Modifiers |
|---|---|
| Theme | `dark:` `light:` / `not-dark:` |
| Interactive | `pressed:` `focus:` `hover:`(RNW) `active:` `disabled:` `checked:` (all have `not-` variants) |
| Responsive | `sm:`(576px) `md:`(768px) `lg:`(1024px) `xl:`(1280px) `2xl:`(1536px) — from `useWindowDimensions()` |
| Important | `!p-0 !m-0` |

```jsx
<View className="p-4 md:p-8 lg:p-12" />
```

## Arbitrary & negative values

```jsx
<View className="bg-[#6366f1] p-[14px] w-[200px] -mt-4 -mx-[10px]" />
```

## Color system

12-shade scale, 1 lightest → 12 darkest: `bg-blue-6`, `text-gray-10`, `border-red-4/50`.

Families: `slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose`
Special: `transparent` `black` `white`
Opacity: `bg-blue-6/50`

## Native-only utilities

| Utility | Effect |
|---|---|
| `tint-{color}` | `tintColor` on Image / icon components |
| `perspective-{n}` | 3-D perspective transform |
| `backface-hidden` | `backfaceVisibility: hidden` |
| `text-shadow` / `text-shadow-lg` | Text shadow |

## Expo Web / React Native Web

In a browser (Expo Web, Metro web), `@kbach/native` switches to the same CSS-class strategy as `@kbach/react` automatically:

- RN components substitute to HTML: `View`/`ScrollView`→`div`, `Text`→`span`, `TextInput`→`input`/`textarea`, `Image`→`img`, `Pressable`/`TouchableOpacity`→`div[role=button]`
- RN-only props (`onChangeText`, `source`, `secureTextEntry`, …) map to HTML equivalents
- Register more: `registerWebElement(Animated.View, 'div')`
- Use the Vite plugin same as `@kbach/react` — `import { kbach } from '@kbach/react/vite'` — and import `kbach.css` in your entry file

## Web-only utilities (ignored on native, no warning)

`caret-*` `accent-*` `stroke-*` `fill-*` `touch-*` `float-*` `clear-*` `line-clamp-*` `scroll-*` `animate-*` `transition` `filter` `backdrop-filter` `print:` `before:` `after:` `selection:` `first-letter:` `first-line:` `marker:` `landscape:` `portrait:` `motion-reduce:` `motion-safe:` `contrast-more:` `contrast-less:` `rtl:` `ltr:` `grid` `grid-cols-*` `ring-offset-*` `outline-*` `cursor-*` `bg-gradient-*`

Exception: `ring`/`ring-{n}`/`ring-{color}` fall back to `borderWidth`/`borderColor` on native (RN has no box-shadow) — this does affect layout there, and shares properties with `border-*`, so combining both on one element means whichever class comes last wins.

## Configuration

```js
// kbach.config.js
module.exports = {
  darkMode: 'attribute', // 'attribute' | 'class' | 'media'

  theme: {
    colors: { brand: { 1: '#eff6ff', 6: '#3b82f6', 10: '#1e3a5f' } },
  },

  extend: {
    colors: { brand: { 6: '#6366f1' } },
    spacing: { 18: 72 },
    fontFamily: { sans: 'CormorantGaramond_400Regular' },
  },

  plugins: [
    ({ addUtility, theme }) => {
      addUtility('border-brand', { borderColor: theme('colors.brand.6'), borderWidth: 2 });
    },
  ],
};
```

CSS inheritance doesn't exist in React Native — apply font utilities to each `Text`, or define styled components once:

```jsx
const Body = styled(Text, 'font-sans text-gray-10 dark:text-white');
```

## Full reference

[kbach-native.md](./kbach-native.md) — complete utility list, native-only utilities, all config options.
