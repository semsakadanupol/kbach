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
font-weight, text-transform/decoration, line-height, letter-spacing,
shadows, and transforms (`translate-x`/`translate-y`, `scale`/`scale-x`/
`scale-y`, `rotate`/`rotate-x`/`rotate-y`/`rotate-z`, `skew-x`/`skew-y`,
`transform-none`, `backface-visible`/`backface-hidden`). Doesn't cover grid,
filters, gradients, DOM-only typography, or the rest of the transform family
(`translate-z`/`scale-z`, `perspective`/`perspective-origin`/`origin`,
`transform-gpu`/`transform-cpu` — no RN equivalent for any of these) — same
scope native itself excludes.

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
`@kbach/react` uses on the DOM, with the FULL modifier set (`group-hover:`,
`peer-hover:`, container queries, `has-[...]:`, etc.) — everything real
Tailwind supports. Native supports a smaller, explicitly-scoped subset; see
"Modifiers on native" below for exactly what that covers.

**Static rendering (SSR) caveat:** `dark:`/responsive classes on content
that's part of the initial pre-rendered HTML resolve against the *server*,
not the visiting browser — so a user in dark mode can briefly see the light
version on first paint. Defer preference-dependent classes until mounted:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

<View className={mounted ? 'bg-gray-1 dark:bg-gray-12' : 'bg-gray-1'} />;
```

### Monorepo installs (npm/yarn/pnpm workspaces)

If your app lives in a monorepo where `@kbach/react-native` is a workspace
package (a `file:`/`link:` dependency, or hoisted rather than nested), watch
for **two physical copies of `react-native`/`react`** ending up in your
dependency tree — one this package would otherwise resolve up to from its
own directory, and a different one your app's own files resolve to. Metro
walks `node_modules` hierarchically per-file, so it can silently hand two
different files two different copies of the *same* module, each with its
own separate module state.

This isn't hypothetical: it's the root cause of a real dark-mode bug this
package shipped and fixed — `useColorScheme()`/`Appearance` in one copy
never saw changes made through the other, so an explicit theme toggle
appeared to do nothing. The fix is a Metro config override that forces a
single instance, **required in your app**, not something this package can
do on your behalf from inside `node_modules`:

```js
// metro.config.js
const path = require('path');
// React Native CLI: const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
// Expo:              const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..'); // -> your monorepo root

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];

const forcedSingleInstance = {
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  react: path.resolve(projectRoot, 'node_modules/react'),
};
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (Object.prototype.hasOwnProperty.call(forcedSingleInstance, moduleName)) {
    return { type: 'sourceFile', filePath: require.resolve(forcedSingleInstance[moduleName]) };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config; // (React Native CLI: mergeConfig(getDefaultConfig(projectRoot), config))
```

A single, non-monorepo `npm install` never hits this — only relevant if your
app and `@kbach/react-native` share a workspace root.

## Modifiers on native

Native has no CSS selector/cascade engine, so only a fixed, explicitly
supported set of modifiers actually applies — everything else (`group-*:`,
`peer-*:`, `has-[...]:`, `aria-*:`, `data-*:`, container queries, ...)
parses without error but never takes effect. Supported today:

- **`dark:`** — reacts to the OS/app color scheme, see "Dark mode" below.
- **`sm:`/`md:`/`lg:`/`xl:`/`2xl:`** — reacts to `useWindowDimensions()`
  crossing the matching `theme.screens` breakpoint (rotation/resize/fold).
- **`active:`** — `Pressable`'s own press state, via its style-callback API.
- **`hover:`** — tracked via `onHoverIn`/`onHoverOut`, which RN only ever
  fires on a platform with real pointer input (iOS 13+/Android/macOS/
  Windows via a mouse/trackpad/Apple Pencil hover) — inert (never fires) on
  a touch-only device, the same way real Tailwind's `hover:` already
  degrades on a touch-only *browser*. Composing it onto any host type is
  harmless even where it never fires.
- **`focus:`** — tracked via `onFocus`/`onBlur` (keyboard/external-keyboard/
  TV-remote/tab navigation, and `TextInput` focus).
- **`disabled:`** — reads the element's own `disabled` prop directly; no
  event tracking needed, since a prop change already re-renders normally.
- Any combination of the above chained on one class (`sm:dark:bg-blue-8`,
  `hover:focus:opacity-100`) requires every named condition to hold at once
  — chain order never matters (`dark:sm:` and `sm:dark:` are equivalent).

`group-hover:`/`peer-hover:` and friends are NOT implemented on native —
doing so needs a React Context bridge (propagating an ancestor's hover/
press/focus state down to descendants, since there's no `.group`/`.peer`
selector relationship to lean on) that doesn't exist today. If you need
group/peer-style coordination on native right now, lift the shared state
into a parent component yourself and pass it down as an explicit prop.

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
app launches by default (no forced storage dependency). To persist, pass
any async key-value store exposing `getItem`/`setItem` as `<ThemeProvider
persist>` — `@react-native-async-storage/async-storage`'s default export
already matches this shape exactly:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@kbach/react-native';

<ThemeProvider persist={AsyncStorage}>
  <App />
</ThemeProvider>;
```

The persisted mode (if any) is read once on mount and wins over
`defaultMode`; every later explicit choice is written back automatically.
`false` by default — this package still never imports a storage library
itself, so nothing changes for apps that don't opt in. Prefer wiring your
own storage manually instead? `setGlobalThemeMode()` before your first
render still works exactly as before.

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

## Arbitrary math: `calc()`, `clamp()`, `min()`, `max()`

```tsx
<View className="p-[calc(16px+8px)]" />       // -> padding: 24
<View className="w-[clamp(1rem,2rem,3rem)]" /> // -> width: 32
```

Resolves at **build/resolve time**, not runtime — every operand must be a
constant `px`/`rem` length (or a bare number). This works because native has
no CSS engine to evaluate a real `calc()` string at paint time, so the only
way to support it at all is to compute the answer ourselves.

A **viewport-relative** expression (`calc(10vw+8px)`) can't be reduced this
way — no such unit exists on native at all. It already works fine on web
(real CSS); on native the declaration is dropped and a `console.warn`
explains why (dev builds only).

**Percentage-relative width/height** (`calc(100%-3rem)`, `calc(50%+16px)`,
`min(50%,20rem)`, `max(1rem,5%)`, `clamp(16rem,50%,32rem)`) IS supported,
differently: since native has no way to know "100% of what" ahead of time,
this measures the element's own real layout instead —

```tsx
<View className="w-[calc(100%_-_3rem)]" />
<View className="w-[min(50%,20rem)]" />        // half the parent, capped at a fixed size
<View className="w-[clamp(16rem,50%,32rem)]" />
```

Renders once at a plain `100%` (a real RN percentage, resolved correctly by
RN's own layout engine against the parent) purely to trigger a layout
event, then immediately corrects to the actual computed number once
measured — a genuine one-frame measure-then-snap, not instant math like the
constant-only case above, and it keeps re-measuring on every layout (screen
rotation, parent resize, ...) rather than freezing after the first value.
Scoped narrowly, same "reduce fully or bail" philosophy as the constant-only
case: `calc()` takes exactly one percentage term plus one constant term;
`min()`/`max()` take two or more comma-separated arguments, each EITHER a
plain percentage or a constant px/rem expression (not both mixed in one
argument — `min(50%-1rem,20rem)` is out of scope); `clamp()` takes exactly
three. `width`/`height` only in every case — other properties, or anything
that doesn't reduce fully, falls through to the same drop-and-warn behavior
as before.

**Arbitrary values can't contain literal spaces** — this is a pre-existing
rule (real Tailwind has the same one), not specific to `calc()`: a space
inside `[...]` is indistinguishable from the whitespace that separates
class tokens in the first place, so `w-[calc(100% - 3rem)]` silently splits
into three broken tokens before `calc()` is ever even recognized. Write
`w-[calc(100%_-_3rem)]` (underscores) instead — this is exactly what the
unknown-class warning below is for: it'll tell you when this happens.

## Unknown-class warnings (typo detection)

```tsx
<View className="flexx-center" /> // real Kbach classes never have to guess — a typo warns
```

```
Kbach: "flexx-center" doesn't match any known Kbach utility — typo? (skipped) (from className "flexx-center")
```

On native/dev-client builds, a class that doesn't match *any* Kbach
utility on *any* platform gets a `console.warn` (dev builds only, printed
once per unique message) instead of silently doing nothing — the same
signal `@kbach/react`'s Vite plugin already gives you at build time on
web, just at resolve time here instead. A real utility this engine simply
doesn't support on native yet (`grid-cols-3`, `scale-150`, `blur`, ...)
never warns — that's an intentional, documented platform gap (see
`resolve_style.rs`'s own doc comment), not a typo, so it stays silent the
same way it always has.

Not available in Expo Go's pure-JS fallback engine today — that engine has
no web-shaped resolver to check "is this a real Kbach utility at all"
against, only the (smaller) native-supported subset, so it can't
distinguish a genuine typo from a real-but-native-unsupported class
without a much larger port. A real dev-client/CLI build always gets this
check.

## Dynamic tokens

The native counterpart to a real CSS custom property — `var(--x)` already
works in a `className` on Expo Web with zero help from this package (real
CSS, resolved by the browser). This gives native the same className syntax:

```tsx
import { setDynamicToken, useDynamicToken } from '@kbach/react-native';

setDynamicToken('sidebar-width', '240px'); // updates every subscribed element, on both platforms
<View className="w-[var(--sidebar-width)]" />

// Reading the raw value in JS, reactively:
function Sidebar() {
  const width = useDynamicToken('sidebar-width'); // '240px' | undefined
}
```

On web, `setDynamicToken` writes the real CSS custom property to the DOM —
every element using it repaints instantly via the browser's own CSS engine,
no React re-render involved. On native, the className is substituted with
the token's current value before every resolve, and an element referencing
a token re-renders/repaints on its own when that token changes (same
subscription mechanism `dark:` and `sm:`/`md:`/... already use — see
`jsxRuntimeCore.ts`'s own doc comments). An unregistered token name falls
through to the same native invalid-value warning above.

## License

MIT
