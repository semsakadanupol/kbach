# Kbach Native — Complete AI Reference

Kbach is a Tailwind-like utility CSS framework for React Native and Expo. Classes are written as `className` strings and resolved at render time to inline styles. One package includes everything: core engine, JSX runtime, Babel preset, and Metro config helper.

Package: `@kbach/native`

---

## Setup

### 1. babel.config.js

One-liner using the helper:
```js
const { createKbachConfig } = require('@kbach/native');
module.exports = createKbachConfig();
```

Or manually (identical shape to NativeWind):
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

After changing `babel.config.js`, clear the Metro cache:
```
npx expo start --clear
```

---

## Core API

### className prop
Works on any React Native component.
```jsx
<View className="flex-1 bg-gray-2 dark:bg-gray-11 p-4" />
<Text className="text-lg font-bold text-gray-10 dark:text-white" />
<TouchableOpacity className="bg-blue-7 pressed:bg-blue-8 rounded-xl px-6 py-3" />
```

### styled(Component, baseClasses)
Pre-style any component. Handles interaction states automatically. Returns a new component that accepts a `kb` prop for extra classes.
```jsx
import { styled } from '@kbach/native';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';

const Card   = styled(View, 'bg-white dark:bg-gray-9 rounded-2xl p-6 shadow');
const Title  = styled(Text, 'text-2xl font-bold text-gray-10 dark:text-white');
const Button = styled(
  TouchableOpacity,
  'bg-blue-7 pressed:bg-blue-8 dark:bg-indigo-6 dark:pressed:bg-indigo-7 rounded-xl px-6 py-3'
);
const Input = styled(
  TextInput,
  'border border-gray-4 dark:border-gray-7 focus:border-blue-6 bg-white dark:bg-gray-8 rounded-lg px-4 py-3'
);

// Pass extra classes at use time
<Card kb="mt-4 mb-2">
  <Title kb="text-3xl">Hello</Title>
</Card>
```

### useStyles(classes)
Resolve classes to a style object inside a component.
```jsx
import { useStyles } from '@kbach/native';

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

### kb(classes)
Resolve classes outside a component, for use in `StyleSheet.create()` or static contexts.
```js
import { StyleSheet } from 'react-native';
import { kb } from '@kbach/native';

const styles = StyleSheet.create({
  container: kb('flex-1 bg-white p-4') as object,
  title: kb('text-2xl font-bold text-gray-10') as object,
});
```

### cx(...classes)
Conditionally join class strings. Falsy values are ignored.
```jsx
import { cx } from '@kbach/native';

<View className={cx(
  'p-4 rounded-xl',
  isSelected && 'border-2 border-blue-6',
  isDisabled && 'opacity-50',
)} />
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
colors.blue[6]           // '#3b82f6'
colors.blue['6/50']      // 'rgba(59,130,246,0.5)'
colors.white             // '#ffffff'
colors['white/20']       // 'rgba(255,255,255,0.2)'
colors.alpha('#ff6b35', 60) // 'rgba(255,107,53,0.6)'
```

### ThemeToggle
```jsx
<ThemeToggle />                                 // button (default)
<ThemeToggle variant="switch" />               // toggle switch
<ThemeToggle variant="icon-button" />          // icon button
<ThemeToggle variant="button" includeSystem /> // three-way light/dark/system
```

---

## Modifier System

Up to 3 modifiers can be chained in any order.

### Theme & interaction modifiers
| Modifier | Trigger |
|---|---|
| `dark:` | Dark mode active |
| `light:` | Light mode active |
| `pressed:` | Touch pressed |
| `hover:` | Mouse hover (RNW / web target) |
| `focus:` | Element focused |
| `active:` | Element active |
| `disabled:` | Element disabled |
| `checked:` | Checked (checkbox/radio) |

Negated forms: `not-pressed:`, `not-hover:`, `not-focus:`, `not-active:`, `not-disabled:`, `not-checked:`

### Responsive modifiers
Resolved from the current window width via `useWindowDimensions`.

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

### Important modifier
```jsx
<View className="!p-0 !m-0" />
```

---

## Arbitrary Values
```jsx
<View className="bg-[#6366f1]" />
<View className="p-[14px]" />
<Text className="text-[18px]" />
<View className="rounded-[20px]" />
<View className="bg-[rgba(99,102,241,0.15)]" />
<View className="w-[200px]" />
```

---

## Negative Values
```jsx
<View className="-mt-4" />        // marginTop: -16
<View className="-mx-2" />        // marginHorizontal: -8
<View className="-mt-[10px]" />   // marginTop: -10
```

---

## Color with Opacity
```jsx
<View className="bg-blue-6/50" />   // 50% opacity
<View className="bg-gray-10/75" />  // 75% opacity
```

---

## Color System

### 12-shade scale
1 = lightest, 12 = darkest.

```
shade  1   2   3   4   5   6   7   8   9  10  11  12
       ─────────────────────────────────────────────
       light                                    dark
```

Usage: `bg-blue-6`, `text-gray-10`, `border-red-4/50`

### Color families (22 total)
Grays: `slate`, `gray`, `zinc`, `neutral`, `stone`
Colors: `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`
Special: `transparent`, `black`, `white`

---

## Utility Reference

Most Tailwind-equivalent utilities work on native. The ones below list what is available; web-only utilities are gracefully ignored.

### Background
```
bg-{color}           backgroundColor
bg-{color}/{opacity} backgroundColor with alpha
bg-transparent
```

### Text
```
text-{size}     xs(12) sm(14) base(16) lg(18) xl(20) 2xl(24) 3xl(30)
                4xl(36) 5xl(48) 6xl(60) 7xl(72) 8xl(96) 9xl(128)
text-{color}    color
text-left/right/center
```

### Font
```
font-thin/extralight/light/normal/medium/semibold/bold/extrabold/black
font-{family}    sans, mono, serif, or custom
```

### Text decoration
```
underline / line-through / no-underline
```

### Text transform
```
uppercase / lowercase / capitalize / normal-case
italic / not-italic
```

### Spacing — Padding
```
p-{n}  px-{n}  py-{n}  pt-{n}  pr-{n}  pb-{n}  pl-{n}
```

### Spacing — Margin
```
m-{n}  mx-{n}  my-{n}  mt-{n}  mr-{n}  mb-{n}  ml-{n}
```

Spacing scale (1 unit = 4px):
`px(1) 0 0.5(2) 1(4) 1.5(6) 2(8) 2.5(10) 3(12) 3.5(14) 4(16) 5(20) 6(24) 7(28) 8(32) 9(36) 10(40) 11(44) 12(48) 14(56) 16(64) 20(80) 24(96) 28(112) 32(128) 36(144) 40(160) 44(176) 48(192) 52(208) 56(224) 60(240) 64(256) 72(288) 80(320) 96(384) auto full(100%) 1/2 1/3 2/3 1/4 3/4`

### Sizing
```
w-{n}  h-{n}  size-{n}  min-w-{n}  max-w-{n}  min-h-{n}  max-h-{n}
```

### Display / Layout
```
flex / hidden
flex-row / flex-col / flex-row-reverse / flex-col-reverse
flex-wrap / flex-nowrap / flex-wrap-reverse
flex-1 / flex-auto / flex-initial / flex-none
flex-grow / grow / grow-0 / flex-shrink / shrink / shrink-0
basis-{n}
items-start/end/center/baseline/stretch
justify-start/end/center/between/around/evenly
self-start/end/center/auto/stretch
content-start/end/center/between/around/evenly
order-{n}
gap-{n}  gap-x-{n}  gap-y-{n}
```

### Position
```
static / relative / absolute
top-{n}  right-{n}  bottom-{n}  left-{n}
inset-{n}  inset-x-{n}  inset-y-{n}
z-0/10/20/30/40/50/auto
```

### Overflow
```
overflow-hidden / overflow-visible / overflow-scroll
overflow-x-hidden / overflow-x-scroll
overflow-y-hidden / overflow-y-scroll
```

### Border
```
border / border-{n}         borderWidth: 0 1 2 4 8
border-t/r/b/l
border-{color}
border-solid/dashed/dotted
rounded / rounded-none/sm/md/lg/xl/2xl/3xl/full
rounded-t/r/b/l  rounded-tl/tr/bl/br
```

### Shadow
```
shadow-sm / shadow / shadow-md / shadow-lg / shadow-xl / shadow-2xl / shadow-none
```

### Opacity
```
opacity-0/5/10/15/20/25/30/40/50/60/70/75/80/90/95/100
```

### Visibility
```
visible / invisible
```

### Transforms
```
scale-{n}  scale-x-{n}  scale-y-{n}
rotate-{n}
translate-x-{n}  translate-y-{n}
skew-x-{n}  skew-y-{n}
perspective-{n}
```

### Typography misc
```
leading-none/tight/snug/normal/relaxed/loose (+ numeric 3–10)
tracking-tighter/tight/normal/wide/wider/widest
```

---

## Native-only Utilities

These only work in `@kbach/native`:

| Utility | Effect |
|---|---|
| `tint-{color}` | `tintColor` on Image / icon components |
| `perspective-{n}` | 3-D perspective transform |
| `backface-hidden` | `backfaceVisibility: hidden` |
| `text-shadow` | Text shadow (small) |
| `text-shadow-lg` | Text shadow (large) |

```jsx
<Image source={icon} className="tint-blue-6" />
<View className="perspective-500 rotate-y-45" />
<View className="backface-hidden" />
<Text className="text-shadow">Shadowed text</Text>
```

---

## Web-only Utilities (gracefully ignored on native)

These resolve to `null` on React Native and produce no warning:

`caret-*`, `accent-*`, `touch-*`, `float-*`, `clear-*`, `align-*` (vertical),
`line-clamp-*`, `scroll-smooth`, `scroll-auto`, `overflow-clip`,
`overflow-ellipsis`, `bg-clip-text`, `bg-gradient-to-*`,
`animate-*`, `transition`, `filter`, `backdrop-filter`,
`print:`, `before:`, `after:`, `selection:`, `first-letter:`, `first-line:`, `marker:`,
`landscape:`, `portrait:`, `motion-reduce:`, `motion-safe:`,
`contrast-more:`, `contrast-less:`, `rtl:`, `ltr:`,
`mix-blend-*`, `bg-blend-*`, `will-change-*`, `columns-*`, `aspect-*`,
`object-*`, `resize-*`, `appearance-none`, `box-border`, `box-content`,
`grid`, `inline-grid`, `grid-cols-*`, `contents`, `flow-root`,
`block`, `inline`, `inline-block`, `inline-flex`, `cursor-*`, `ring`, `outline-*`

---

## Configuration

```js
// kbach.config.js
module.exports = {
  darkMode: 'attribute', // 'attribute' | 'class' | 'media'

  theme: {
    colors: {
      brand: { 1: '#eff6ff', 6: '#3b82f6', 10: '#1e3a5f' },
    },
  },

  extend: {
    theme: {
      colors: { brand: { 6: '#6366f1' } },
      spacing: { 18: 72 },
    },
  },

  plugins: [
    ({ addUtility, theme }) => {
      addUtility('border-brand', {
        borderColor: theme('colors.brand.6'),
        borderWidth: 2,
      });
    },
  ],
};
```

The Babel preset automatically syncs `kbach.config.js` into the runtime — no extra setup needed.

### Custom font families
```js
// kbach.config.js
module.exports = {
  extend: {
    fontFamily: {
      sans:        'CormorantGaramond_400Regular',
      'sans-md':   'CormorantGaramond_500Medium',
      'sans-semi': 'CormorantGaramond_600SemiBold',
      'sans-bold': 'CormorantGaramond_700Bold',
    },
  },
};
```

CSS inheritance does not exist in RN. Apply font utilities to each `Text`, or use `styled()`:
```jsx
const Body    = styled(Text, 'font-sans');
const Heading = styled(Text, 'font-sans-bold text-2xl');
```

---

## Common Patterns

### Dark mode screen
```jsx
<View className="flex-1 bg-gray-2 dark:bg-gray-11 p-4">
  <Text className="text-2xl font-bold text-gray-10 dark:text-white mb-4">
    Hello
  </Text>
</View>
```

### Interactive button
```jsx
const Button = styled(
  TouchableOpacity,
  'bg-blue-7 pressed:bg-blue-8 dark:bg-indigo-6 rounded-xl px-6 py-3 items-center'
);

<Button>
  <Text className="text-white font-semibold">Press me</Text>
</Button>
```

### Form input
```jsx
const Input = styled(
  TextInput,
  'border border-gray-4 dark:border-gray-7 focus:border-blue-6 bg-white dark:bg-gray-8 rounded-lg px-4 py-3 text-gray-10 dark:text-white'
);
```

### Responsive layout
```jsx
<View className="flex-1 flex-col md:flex-row gap-4">
  <View className="w-full md:w-64">…</View>
  <View className="flex-1">…</View>
</View>
```

### Conditional styles
```jsx
<View className={cx(
  'p-4 rounded-xl border',
  isSelected ? 'border-blue-6 bg-blue-1' : 'border-gray-3 bg-white',
  isDisabled && 'opacity-50'
)} />
```

### Image tinting
```jsx
<Image source={checkIcon} className="tint-green-6 w-6 h-6" />
<Image source={warningIcon} className="tint-amber-6 w-6 h-6" />
```

### StyleSheet.create integration
```js
const styles = StyleSheet.create({
  container: kb('flex-1 bg-white p-4') as object,
  title:     kb('text-2xl font-bold text-gray-10') as object,
  button:    kb('bg-blue-7 rounded-xl px-6 py-3') as object,
});
```
