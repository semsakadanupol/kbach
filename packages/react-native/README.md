# @kbach/react-native

Kbach's utility-class styling engine for React Native — the same class
names as [`@kbach/react`](https://www.npmjs.com/package/@kbach/react),
resolved to a `StyleSheet`-ready style object instead of injected CSS.

> Beta. Native is Android-only (no iOS bridge yet). Ships a prebuilt native
> module — no Rust toolchain or manual native wiring required.

## Install

```sh
npm install @kbach/react-native
```

### React Native CLI

```js
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['@kbach/react-native/babel-plugin'],
};
```

Rebuild the Android app afterward so Gradle picks up the native module.

### Expo Go

Works out of the box — no prebuild, no dev client, nothing to configure.
Expo Go can't load third-party native code, so this falls back to a pure-JS
engine automatically. Covers layout, spacing, border/radius, plain colors,
font-weight, text-transform/decoration, line-height, letter-spacing, and
shadows. Doesn't cover grid, transforms, filters, gradients, or DOM-only
typography — same scope native itself excludes.

### Expo (dev client / prebuild)

Gets you the full native engine instead of the JS fallback:

```js
// babel.config.js
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: ['@kbach/react-native/babel-plugin'],
};
```

```sh
npx expo prebuild
npx expo run:android
```

Requires the New Architecture enabled (`"newArchEnabled": true` in
`app.json`, on by default in current Expo SDKs). EAS Build works the same
way, no extra config.

### Expo Web

Works out of the box — resolves through the same real-CSS engine
`@kbach/react` uses on the DOM, with full modifier support (`hover:`,
`focus:`, `group-hover:`, container queries, etc.), not just the
`dark:`/`active:`/responsive subset native supports.

**Static rendering (SSR) caveat:** `dark:`/responsive classes on content
that's part of the initial pre-rendered HTML resolve against the *server*,
not the visiting browser — so a user in dark mode can briefly see the light
version on first paint. Defer preference-dependent classes until mounted:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

<View className={mounted ? 'bg-gray-1 dark:bg-gray-12' : 'bg-gray-1'} />;
```

## Dark mode

```tsx
import { useTheme } from '@kbach/react-native';

function ThemeToggle() {
  const { mode, isDark, setMode, toggle } = useTheme();
  return <Pressable onPress={toggle}><Text>{mode}</Text></Pressable>;
}
```

Works anywhere, no provider needed. `<ThemeProvider defaultMode="dark">` is
optional, for seeding a startup default. Outside React, use
`getGlobalDarkMode()`/`toggleGlobalDarkMode()` instead.

Follows the OS setting live until overridden, and isn't persisted across
app launches (no built-in storage dependency). To persist, read your own
storage at startup and call `setGlobalThemeMode()` before your first render.

## Reading colors as values

For anywhere you need a real color, not a `className` — a chart prop, a
native shadow color:

```tsx
import { useColors } from '@kbach/react-native';

const colors = useColors();
colors.blue[6];       // '#2563eb' — static, same value in both modes
colors.blue['6/50'];  // same, at 50% opacity
```

Any color can be defined in the theme as a plain string (static) or a
`{ light, dark }` pair — fully manual, resolved per the current dark-mode
state:

```ts
setTheme({
  ...defaultTheme,
  colors: { ...defaultTheme.colors, brand: { light: '#2563eb', dark: '#93c5fd' } },
});
```

A shade-family lookup (`colors.blue[n]`) auto-mirrors to shade `13 - n` in
dark mode — this palette's own convention is 1 = lightest, 12 = darkest, so
that's the same visual weight relative to its own background, no manual
`colors.blue[isDark ? 7 : 6]` needed.

## License

MIT
