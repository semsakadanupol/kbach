# @kbach/react-native

Kbach's utility-class styling engine for React Native — the same class
names as [`@kbach/react`](https://www.npmjs.com/package/@kbach/react),
resolved to a real `StyleSheet`-ready style object instead of injected CSS.

> **Beta.** Native (Android-only, no iOS bridge yet) resolves through a
> Kotlin/JNI TurboModule to an inline style object; Expo Web /
> react-native-web resolves through the same Rust engine compiled to WASM,
> but to real generated CSS instead (full modifier support, including
> `hover:`/`focus:`/etc. — see "Expo Web" below); Expo Go — which can load
> neither a TurboModule nor WASM — resolves through a third, pure-JS
> fallback engine with reduced utility coverage (see "Expo Go" below). The
> native module ships prebuilt (see Setup below) — no Rust toolchain or
> manual native wiring required on any platform.

## Setup

```sh
npm install @kbach/react-native
```

One package, nothing else to install — the Kotlin TurboModule and its
prebuilt native `.so` ship inside this same package's own `android/`
folder. Android's autolinking discovers it automatically the moment it's
in `node_modules`; no manual `MainApplication.kt` edit needed. Works the
same way whether your app was created with the React Native CLI or with
Expo, **including Expo Go** — see its own section below for the scope
tradeoff that involves.

### React Native CLI

Add the Babel plugin so your app's JSX routes through Kbach's JSX runtime
instead of `react/jsx-runtime`:

```js
// babel.config.js
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['@kbach/react-native/babel-plugin'],
};
```

Then rebuild the Android app (`npm run android`, or a clean Gradle build if
you're re-running one that's already built) so Gradle picks up the new
native module. See `apps/native-sandbox` in the
[repo](https://github.com/semsakadanupol/kbach) for a full working
reference project, including the Metro config a monorepo setup like this
one needs (a plain single-app install doesn't need any of that — it's
only relevant if you're linking packages locally instead of installing
from npm).

### Expo Go

**Works — no prebuild, no dev client, no extra setup.** Expo Go is a
single fixed binary Expo pre-builds and ships through the app stores,
containing only the native code Expo bundled into it at their own build
time — there is no mechanism for *any* third-party package to add native
code to it at runtime, whether that's a raw TurboModule (what this
package's Android/Expo-dev-client path uses) or even Expo's own Modules
API. So instead of trying to load one, this package detects that the
TurboModule isn't registered (`TurboModuleRegistry.get('KbachModule')`
returns `null` rather than throwing) and transparently falls back to a
**third resolution engine**: a pure-JavaScript reimplementation of the
same class-resolution logic, ported by hand from
[`resolve_style.rs`](https://github.com/semsakadanupol/kbach/blob/main/packages/core-engine/src/resolve_style.rs)
and its resolvers (see
[`src/jsEngine`](https://github.com/semsakadanupol/kbach/blob/main/packages/react-native/src/jsEngine)
in the repo) — no WASM (Hermes has no `WebAssembly` API at all) and no
native code, so it can run anywhere plain JS runs, Expo Go included. A
real dev-client or CLI build always has the TurboModule registered, so
this fallback activates ONLY inside Expo Go itself; every other
environment is completely unaffected.

The tradeoff: the JS engine covers layout, spacing, border/radius,
plain-hex colors (`bg-*`/`text-*`, no opacity composition), font-weight,
text-transform (`uppercase`/`lowercase`/`capitalize`), text-decoration-line
(`underline`/`line-through`/`no-underline`), `italic`/`not-italic`, numeric
line-height and arbitrary letter-spacing, and `shadow-*` — the same
native-representable subset
`resolve_utility_native` (the Rust engine's own native dispatcher) covers,
minus a WASM/JNI dependency. It does **not** cover anything that subset
already excludes on native (grid, transforms, filters, gradients, DOM-only
typography like `truncate`/`decoration-*`/`indent-*`, interactivity/scroll
utilities) — those were never available outside a dev client/CLI build,
Expo Go doesn't change that. `dark:`/`active:`/`sm:`-`2xl:` modifiers work
identically to the native/WASM engines (same gating logic, just inlined
rather than routed through a shared registry). If you hit a class that
silently doesn't apply only in Expo Go, check whether it resolves under a
dev client first — if it does, it's outside this fallback's ported scope,
not a bug in the class itself.

### Expo (dev client / prebuild — Android)

A dev client gets you the *full* native engine (the same one the CLI path
above uses) instead of the JS fallback above — worth it once you need
something outside that fallback's scope. Built once via `expo prebuild`/
`expo run:android`, functionally the same "real native project" as the CLI
path above:

```js
// babel.config.js
module.exports = {
  presets: ['babel-preset-expo'], // not '@react-native/babel-preset'
  plugins: ['@kbach/react-native/babel-plugin'],
};
```

```sh
npx expo prebuild    # generates android/ (and ios/, which this package doesn't support yet)
npx expo run:android # builds and installs a dev client with the native module included
```

Also requires the New Architecture enabled (Expo's default in current SDK
versions) — the native module is a TurboModule, which doesn't exist under
the legacy bridge at all. If you're on an older SDK/config with the New
Architecture off, turn it on in `app.json`
(`"newArchEnabled": true` under `expo`) before prebuilding.

EAS Build works the same way — it runs the same `prebuild` step, so no
extra configuration beyond the two steps above.

See `apps/expo-sandbox` in the [repo](https://github.com/semsakadanupol/kbach)
for a full working reference project covering both this section and Expo
Web below — including the `metro.config.js` a monorepo setup like this one
needs (a plain single-app install doesn't need it).

### Expo Web

**Works — no extra setup, no separate package, no init call.** `expo start
--web` (and EAS's web builds) render through `react-native-web` —
`View`/`Text`/etc. become real DOM elements with real CSS, not a
Kotlin/JNI bridge — so on web this package resolves classes through the
same real-CSS engine
[`@kbach/react`](https://www.npmjs.com/package/@kbach/react) uses on the
DOM, not the inline-style-object engine native/Expo Go use. Metro picks
the right implementation per platform on its own via this package's
`"browser"` (client bundles) and `"node"` (Expo Router's static-rendering/
SSR bundles — a genuinely separate resolution axis from `platform: 'web'`,
see `nativeBridge.web.ts`'s own doc comment) export conditions; your app
code and JSX never change. The WASM module initializes itself eagerly
(synchronously, at import time — no `await` needed before your first
render, unlike a from-scratch WASM setup).

**Full modifier support, including `hover:`/`focus:`/`group-hover:`/
`has-[...]`/container queries/etc.** — every modifier
[`registry.rs`](https://github.com/semsakadanupol/kbach/blob/main/packages/core-engine/src/registry.rs)
knows, not just the `dark:`/`active:`/responsive subset native/Expo Go
gate via a live JS parameter. This is possible specifically *because* Expo
Web is real DOM: real CSS selectors (`:hover`, `:focus`, `@media`,
`@container`, ...) work exactly the way they do for `@kbach/react`, no
polyfilling needed. The one wrinkle: `react-native-web`'s `View`/`Text`/
`Pressable` don't forward a `className` prop to the DOM at all (checked
against its own `forwardedProps` whitelist), so this can't render a
literal `className` the way `@kbach/react` does on plain DOM. What it uses
instead: RN's `dataSet` prop (which RNW DOES forward, as real `data-*`
attributes) carries the resolved class text into a `data-kb="..."`
attribute, and the generated CSS targets it with `[data-kb~="..."]`
attribute selectors instead of `.class` selectors — functionally
identical to a real `className`, just reached through RN's own prop
system instead. This also means `active:` is now REAL CSS `:active` (the
browser's own press-state detection), not a `Pressable`-specific style-
function simulation the way native's `active:` still is — one fewer
special case, and closer to actual Tailwind's own semantics.

Everything else about this matches `@kbach/react`'s own web engine
exactly — same
[`resolve_utility`](https://github.com/semsakadanupol/kbach/blob/main/packages/core-engine/src/resolvers/mod.rs)
dispatch (not the reduced `resolve_utility_native` subset), so grid,
transforms, filters, gradients, and DOM-only typography (`truncate`,
`decoration-*`, etc.) all resolve on Expo Web even though they don't on
native or Expo Go — see this README's "What this is" section for what's
covered elsewhere.

#### Expo Router static rendering: `dark:`/responsive on the FIRST paint

If you use [static rendering](https://docs.expo.dev/router/reference/static-rendering/)
(`web.output: "static"` — Expo Router's SSR/pre-render feature), any
`dark:`/`sm:`/etc. class on content that's part of the **initial,
pre-rendered HTML** resolves against whatever the **server** (Node.js, no
real display/viewport) reports — not the visiting browser's actual OS
preference or window size. React's hydration then adopts that
server-rendered markup as-is rather than silently overwriting it with the
client's own (correct) values, because a `style`-attribute-only difference
doesn't fail hydration the way a text-content mismatch does. Concretely: a
user with their OS in dark mode can see a `dark:` class resolve to its
*light* value on first paint, with no error or warning anywhere.

**This isn't a Kbach bug** — it's the same fundamental constraint every
OS-preference-based styling system has under SSR (Next.js's own dark-mode
docs describe the identical problem and fix). The standard fix applies
here unchanged: don't resolve preference-dependent classes on
initially-server-rendered content at all; defer them to after your app has
mounted client-side, e.g.:

```tsx
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

function ThemedScreen() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Neutral on the server AND on the client's first paint (matches exactly,
  // no hydration mismatch) — only becomes preference-aware once mounted.
  return (
    <View className={mounted ? 'bg-gray-1 dark:bg-gray-12' : 'bg-gray-1'}>
      <Text>Hello</Text>
    </View>
  );
}
```

Content that only ever renders client-side (not part of the statically
pre-rendered route) is unaffected — this only matters for what's visible
before your first `useEffect` runs.

## What this is

- A JSX runtime (`@kbach/react-native/jsx-runtime`) that intercepts
  `className`/`kb` props on every element and calls into the native, WASM,
  or pure-JS bridge (whichever platform you're on — see the Setup section
  above), synchronously, on every render. On native and Expo Go this
  resolves to an inline `style` object; on Expo Web it resolves to real
  injected CSS plus a `dataSet={{ kb: '...' }}` prop instead — see "Expo
  Web" below for why the two differ.
- A Babel plugin (`@kbach/react-native/babel-plugin`) that routes your
  app's own files (never `node_modules`) through that JSX runtime via a
  per-file `@jsxImportSource` pragma.
- `setTheme()`/`getTheme()` for customizing the color palette and spacing
  scale — the same `ThemeConfig` shape `@kbach/react` uses, kept as an
  independent type here so a native-only project isn't forced to depend on
  a web-oriented package.
- `shadow-*` resolves to real native shadows — RN's discrete
  `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` props plus
  Android's `elevation` (both emitted together; `elevation` is what
  actually renders a shadow on Android — the `shadow*` props are iOS-only
  in RN itself, ready for whenever this package gets an iOS bridge),
  derived from the same named tiers (`sm`/`DEFAULT`/`md`/`lg`/`xl`/`2xl`)
  `@kbach/react`'s CSS `box-shadow` scale uses. `shadow-inner` and
  arbitrary `shadow-[...]` values aren't supported — RN's native shadow
  props can't express an inset shadow, and an arbitrary value is a raw CSS
  string with no mechanical translation into discrete native props.
- Responsive breakpoints (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`) — same
  mobile-first "min-width and up" semantics as web, freely combinable with
  `dark:`/`active:` (e.g. `dark:md:bg-blue-8`). On native/Expo Go, gated
  live against the current window width (`Dimensions.get('window').width`)
  — call RN's own `useWindowDimensions()` somewhere in your tree to
  re-render on rotation/resize, same role `useColorScheme()` plays for
  `dark:` below. On Expo Web this is real `@media (min-width: ...)` CSS
  instead (see "Expo Web" above) — the browser evaluates it continuously
  on its own, so no `useWindowDimensions()` call is needed there at all.

## Dark mode

Works standalone, with zero provider — same architecture as `@kbach/react`:

```tsx
import { useGlobalDarkMode, toggleGlobalDarkMode } from '@kbach/react-native';

function ThemeToggle() {
  const isDark = useGlobalDarkMode();
  return <Pressable onPress={toggleGlobalDarkMode}><Text>{isDark ? 'Dark' : 'Light'}</Text></Pressable>;
}
```

Or the optional `<ThemeProvider>` / `useTheme()` pair, reading and writing
the exact same global store:

```tsx
import { ThemeProvider, useTheme } from '@kbach/react-native';

function Toggle() {
  const { mode, isDark, setMode, toggle } = useTheme();
  return <Pressable onPress={toggle}><Text>{mode}</Text></Pressable>;
}

<ThemeProvider defaultMode="system">
  <Toggle />
</ThemeProvider>;
```

By default the mode follows the OS `Appearance` setting live until you
explicitly override it — and **isn't persisted across app launches**.
There's no React-Native-builtin equivalent of `localStorage`, and adding
one would mean forcing a real native dependency (e.g.
`@react-native-async-storage/async-storage`) on every consumer, even ones
that don't want it. If you want persistence, read your own storage at
startup and call `setGlobalThemeMode()` with the result before your first
render — the same "seed once" shape `<ThemeProvider defaultMode>` itself
uses internally.

## License

MIT
