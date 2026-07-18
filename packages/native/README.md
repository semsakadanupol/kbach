# @kbach/native

Tailwind-like utility classes for React Native and Expo. One package includes everything: the core engine, JSX runtime, and Babel preset. Classes are written as `className` strings and resolved to inline styles at render time.

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

[npm package](https://www.npmjs.com/package/@kbach/native)

```
npm install @kbach/native
```

## Setup

### 1. babel.config.js

One-liner using the helper:

```js
const { createKbachConfig } = require('@kbach/native');
module.exports = createKbachConfig();
```

Or manually:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: '@kbach/native' }],
      '@kbach/native/babel',
    ],
  };
};
```

Merging into an existing Babel config:

```js
const { withKbachBabel } = require('@kbach/native');

module.exports = withKbachBabel({
  presets: ['babel-preset-expo'],
  plugins: [/* your existing plugins */],
});
```

After changing `babel.config.js`, clear the Metro cache:

```
npx expo start --clear
```

### 2. Wrap your app

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

`ThemeProvider` reads `useColorScheme()` and `useWindowDimensions()` automatically — no extra props needed.

## API

### className / kb prop

Works on any React Native component — `View`, `Text`, `TouchableOpacity`, `TextInput`, and third-party components.

```jsx
<View className="flex-1 bg-gray-2 dark:bg-gray-11 p-4" />
<Text className="text-lg font-bold text-gray-10 dark:text-white" />
<TouchableOpacity className="bg-blue-7 pressed:bg-blue-8 rounded-xl px-6 py-3" />
```

### styled(Component, classes)

Pre-style any component. Handles interaction states (`pressed:`, `focus:`, etc.) automatically. Pass extra classes at use time with the `kb` prop.

```jsx
import { styled } from '@kbach/native';
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

<Card kb="mt-4 mb-2">
  <Title kb="text-3xl">Hello</Title>
</Card>
```

### cx(...classes)

Conditionally join class strings. Falsy values are ignored.

```jsx
import { cx } from '@kbach/native';

<View className={cx(
  'p-4 rounded-xl border',
  isSelected ? 'border-blue-6 bg-blue-1' : 'border-gray-3 bg-white',
  isDisabled && 'opacity-50',
)} />
```

### useStyles(classes, state?)

Resolve classes to a style object inside a component.

```jsx
import { useStyles } from '@kbach/native';
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

// With interaction state
const [pressed, setPressed] = useState(false);
const style = useStyles('bg-blue-5 pressed:bg-blue-7 rounded-lg', { pressed });
```

### kb(classes)

Resolve classes outside a component, for `StyleSheet.create()` or static contexts.

```js
import { StyleSheet } from 'react-native';
import { kb } from '@kbach/native';

const styles = StyleSheet.create({
  container: kb('flex-1 bg-white p-4') as object,
  title:     kb('text-2xl font-bold text-gray-10') as object,
});
```

### useTheme()

```js
import { useTheme } from '@kbach/native';

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
import { useIsDark } from '@kbach/native';
const isDark = useIsDark();
```

### useColors()

Returns the active theme's color palette as a smart proxy.

```js
import { useColors } from '@kbach/native';

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
<View className="dark:sm:pressed:bg-blue-8" />
```

### Theme

| Modifier | Trigger |
|---|---|
| `dark:` | Dark mode |
| `light:` / `not-dark:` | Light mode |

### Interactive

| Modifier | Trigger |
|---|---|
| `pressed:` | Touch / click pressed |
| `focus:` | Element focused |
| `hover:` | Mouse hover (React Native Web) |
| `active:` | Active state |
| `disabled:` | Disabled |
| `checked:` | Checked |

Negated: `not-pressed:`, `not-focus:`, `not-hover:`, `not-active:`, `not-disabled:`, `not-checked:`

### Responsive

Resolved from current window width via `useWindowDimensions()`.

| Modifier | Min-width |
|---|---|
| `sm:` | 576 px |
| `md:` | 768 px |
| `lg:` | 1024 px |
| `xl:` | 1280 px |
| `2xl:` | 1536 px |

```jsx
<View className="p-4 md:p-8 lg:p-12" />
```

### Important

```jsx
<View className="!p-0 !m-0" />
```

## Arbitrary values

```jsx
<View className="bg-[#6366f1]" />
<View className="p-[14px]" />
<Text className="text-[18px]" />
<View className="rounded-[20px]" />
<View className="w-[200px]" />
```

## Negative values

```jsx
<View className="-mt-4" />      // marginTop: -16
<View className="-mx-2" />      // marginHorizontal: -8
<View className="-mt-[10px]" /> // marginTop: -10
```

## Color system

12-shade scale — 1 lightest, 12 darkest. Use as `bg-blue-6`, `text-gray-10`, `border-red-4/50`.

Families: `slate gray zinc neutral stone red orange amber yellow lime green emerald teal cyan sky blue indigo violet purple fuchsia pink rose`  
Special: `transparent` `black` `white`

Opacity modifier: `bg-blue-6/50` (50% alpha)

## Native-only utilities

| Utility | Effect |
|---|---|
| `tint-{color}` | `tintColor` on Image / icon components |
| `perspective-{n}` | 3-D perspective transform |
| `backface-hidden` | `backfaceVisibility: hidden` |
| `text-shadow` | Text shadow (small) |
| `text-shadow-lg` | Text shadow (large) |

```jsx
<Image source={icon} className="tint-blue-6 w-6 h-6" />
<View className="perspective-500 rotate-y-45" />
<Text className="text-shadow font-bold">Shadowed</Text>
```

## Expo Web / React Native Web

When the bundle runs in a browser (Expo Web, Metro web target), `@kbach/native` automatically switches to the same CSS-class strategy as `@kbach/react`:

- React Native components are substituted with semantic HTML elements:

| Component | HTML tag |
|---|---|
| `View`, `ScrollView`, `SafeAreaView` | `div` |
| `Text` | `span` |
| `TextInput` | `input` / `textarea` (multiline) |
| `Image` | `img` |
| `Pressable`, `TouchableOpacity` | `div` (role="button") |
| `FlatList`, `SectionList` | `div` |

- CSS classes are applied instead of inline styles — the same kbach.css approach as `@kbach/react`.
- React Native–only props (`onChangeText`, `source`, `secureTextEntry`, `keyboardType`, etc.) are mapped to their HTML equivalents.
- To register additional components: `registerWebElement(Animated.View, 'div')`.

To use the Vite plugin on an Expo Web project, add it to `vite.config.ts`:

```ts
import { kbach } from '@kbach/react/vite';

export default defineConfig({
  plugins: [kbach()],
});
```

Create and import `kbach.css` in your entry file exactly as in the `@kbach/react` setup.

## Web-only utilities (gracefully ignored on native)

These resolve to `null` on React Native and produce no warning:

`caret-*`, `accent-*`, `stroke-*`, `fill-*`, `touch-*`, `float-*`, `clear-*`, `line-clamp-*`, `scroll-*`, `animate-*`, `transition`, `filter`, `backdrop-filter`, `print:`, `before:`, `after:`, `selection:`, `first-letter:`, `first-line:`, `marker:`, `landscape:`, `portrait:`, `motion-reduce:`, `motion-safe:`, `contrast-more:`, `contrast-less:`, `rtl:`, `ltr:`, `grid`, `grid-cols-*`, `ring-offset-*`, `outline-*`, `cursor-*`, `bg-gradient-*`

`ring`/`ring-{n}`/`ring-{color}`/`ring-inset` are the one exception in this
family — they fall back to `borderWidth`/`borderColor` on native (the closest
available approximation, since RN has no box-shadow) instead of resolving to
null. This does affect layout on native (unlike the real web ring) and shares
properties with `border-*`, so combining `border-*` and `ring-*` on the same
native element means whichever class comes last wins.

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
    screens: { '3xl': 1920 },
    fontFamily: {
      sans:        'CormorantGaramond_400Regular',
      'sans-md':   'CormorantGaramond_500Medium',
      'sans-bold': 'CormorantGaramond_700Bold',
    },
  },

  plugins: [
    ({ addUtility, addVariant, theme }) => {
      addUtility('border-brand', {
        borderColor: theme('colors.brand.6'),
        borderWidth: 2,
      });
      addVariant('long-press', {
        pseudo: ':active',
        jsBehavior: 'interactive',
        jsMatch: (_, state) => !!state.longPressed,
      });
    },
  ],
};
```

CSS inheritance does not exist in React Native. Apply font utilities to each `Text`, or define styled components once:

```jsx
const Body    = styled(Text, 'font-sans text-gray-10 dark:text-white');
const Heading = styled(Text, 'font-sans-bold text-2xl text-gray-10 dark:text-white');
```

## Full reference

See [kbach-native.md](./kbach-native.md) for the complete utility reference, native-only utilities, and configuration options.
