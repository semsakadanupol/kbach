# `@kbach/react-native` — reference for AI assistants

The React Native binding of [Kbach](https://github.com/semsakadanupol/kbach)
— the same Tailwind-v4-shaped class-name vocabulary as `@kbach/react`,
resolved to a **`StyleSheet`-ready style object at render time** via a
shared Rust core (JNI on Android, WASM on Expo Web, a pure-JS fallback on
Expo Go and iOS). This file covers `@kbach/react-native` only; for the
cross-package overview, `kbach.config.js` reference, the color palette,
and how the underlying engine is built, see the repo root's
[AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

---

## 1. Install + setup

```sh
npx @kbach/cli init
```

Automates everything below — installs `@kbach/react-native`, patches (or
creates) `babel.config.js` via a format-preserving codemod (handles both
Expo's function-export form and React Native CLI's plain object-export
form), and on React Native CLI offers to run the native rebuild right
there. Safe to re-run at any time (idempotent — reports "already has the
kbach babel plugin" rather than duplicating the entry). See
[`packages/cli/AGENTS.md`](../cli/AGENTS.md) for exactly what it detects
and changes, and what it does when the codemod can't safely apply
(prints the same manual snippet shown below, rather than guessing).

The manual steps below are both the CLI's own fallback and the accurate
reference for what it actually does — start here if you're wiring this
up by hand, or the CLI reported it couldn't:

```sh
npm install @kbach/react-native@beta
```

The babel plugin is **required on every target, including Expo Go** — it
injects the per-file `@jsxImportSource @kbach/react-native` pragma
(babel-plugin.js) that routes `className` through this package's
jsx-runtime instead of `react/jsx-runtime`; nothing else makes
interception happen. Confirmed as a real, reported doc bug: the table
below used to say "None" for Expo Go/Expo Web, and a from-scratch repro
(fresh Expo project, README's own example, zero babel config, Expo Go on
a real emulator) showed `className` doing nothing at all — no styling, no
warning, no error — exactly as this mechanism predicts. What differs per
target is what happens *after* the plugin is in place:

| Target | Setup |
| :-- | :-- |
| **Expo Go** | Babel plugin. A pure-JS fallback engine loads automatically after that (reduced utility coverage) — no other setup. |
| **Expo Web** / `react-native-web` | Babel plugin. Uses the same WASM CSS engine as `@kbach/react` after that — no other setup. |
| **Expo dev client / prebuild / EAS** | Babel plugin, then `npx expo prebuild && npx expo run:android`. Full native engine. |
| **React Native CLI** | Babel plugin, then restart Metro with `--reset-cache` and rebuild the Android app. |

Babel plugin — added to the existing `babel.config.js` (keep the function
form Expo generates; only add the `plugins` entry):

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['@kbach/react-native/babel-plugin'],
  };
};
```

React Native CLI uses `presets: ['module:@react-native/babel-preset']` and
a plain object export.

**Native is Android-only** (no iOS bridge yet) — on iOS, every build
(dev client, CLI, EAS) runs the same reduced-coverage JS-fallback engine
as Expo Go, not the full native engine (see §3's engine table).

## 2. What the babel plugin does

Per user source file (never `node_modules`, never Metro/Expo virtual
modules, never `kbach.config.js` itself):

1. Prepends a `// @jsxImportSource @kbach/react-native` comment so the JSX
   transform routes `className` through this package's jsx-runtime.
2. Prepends `require('@kbach/react-native').applyKbachConfig(require('<abs
   path>/kbach.config.js'))` if that file exists at the project root — so
   the config is applied before the app's first render with **no import or
   call in app code**.

A dev-server restart is required after changing `kbach.config.js` or the
babel config — for the babel config specifically, a plain restart isn't
reliably enough (Metro's transform cache doesn't always invalidate on a
babel config change on its own); use `--reset-cache` (`npx react-native
start --reset-cache` / `npx expo start --clear`).

## 3. How resolution works

`className` on a host element (`View`, `Text`, `Pressable`, …) is
intercepted by the jsx-runtime and resolved to a style object. One of three
engines does the work, chosen automatically:

| Runtime | Engine | Mechanism |
| :-- | :-- | :-- |
| Android dev-client / CLI build | **Rust via JNI** (`KbachModule` TurboModule, prebuilt `.so`) | `resolveStyle(classString, themeJson, colorScheme, pressed, width)` → JSON style object. |
| Expo Web / `react-native-web` | **Rust via WASM** (`generate_css_attr`) | Emits real CSS rules into a `<style>` tag; element gets `dataSet={{ kb }}` and rules target `[data-kb~="…"]`. Full modifier set. |
| Expo Go | **Pure-JS fallback** (`jsEngine/`) | A partial TS port of the native resolver. No custom native module can load in Expo Go. |
| iOS — ANY build (dev-client, CLI, EAS) | **Pure-JS fallback** (`jsEngine/`) | Same reduced-coverage path as Expo Go, since there's no iOS native module at all yet (`TurboModuleRegistry.get('KbachModule')` returns `null` on iOS, so `resolveStyle` falls through to the JS engine — see nativeBridge.ts). Not specific to Expo Go; a real iOS dev-client/CLI build is on this row too. |

Resolution is memoized per `(classString, pressed, colorScheme, width,
theme)`.

## 4. Modifiers on native

Native has no selector/cascade engine. Two groups:

**Resolved in the engine from live parameters:**
- `dark:` — current OS/app color scheme.
- `sm:` `md:` `lg:` `xl:` `2xl:` — window width vs `theme.screens`.
- `min-[500px]:` / `max-[30rem]:` — arbitrary width breakpoints (constant
  px/rem only).
- `active:` — `Pressable` press state (via its style-callback).

**Resolved in `jsxRuntimeCore.ts` from React props, before the engine sees
the string:**
- `hover:` — `onHoverIn`/`onHoverOut` — only fires for pointer-capable
  input (mouse/trackpad); inert on pure touch.
- `focus:` — `onFocus`/`onBlur`.
- `disabled:` — the element's own `disabled` prop.
- `data-[key=value]:` / `data-[key]:` / `aria-[…]:` / static `aria-*`
  shortcuts — the element's own `data-*` / `aria-*` props.

A satisfied prop-based modifier is rewritten to an internal `_kbon` marker
(one per satisfied modifier) so it still contributes to specificity.

**Prop-based modifiers never inherit from an ancestor.** `disabled:` /
`aria-[…]:` / `data-[…]:` read `hostRest` off THAT exact element's own
props (`propBasedModifierState` in jsxRuntimeCore.ts) — there is no
`group-disabled:`-style cascade on native to inherit one through. Confirmed
as a real footgun (reported after two independent hits building a demo
app): `<Pressable disabled><Text className="disabled:text-gray-5">` does
nothing at all, silently — `Text` never received a `disabled` prop, so
`propBasedModifierState` returns `null` for it (no opinion), the modifier
is treated as never-satisfied, and nothing warns. The prop has to be
repeated on whichever element actually carries the modifier:
`<Pressable disabled><Text disabled className="disabled:text-gray-5">`.

**Not supported** (parse without error, never apply): `group-*`, `peer-*`,
`has-[…]`, container queries, `*:` / `**:`, `before:` / `after:` and other
pseudo-elements.

**Specificity / class order.** When two classes set the same property, the
one with more satisfied modifiers wins **regardless of source order** —
`dark:bg-black bg-white` and `bg-white dark:bg-black` both resolve to black
in dark mode, matching web. Equal specificity falls back to last-token-wins.
`transform-none` is an exception: it clears all transforms above it in
source order regardless of specificity.

Chaining composes and is order-independent (`dark:sm:` ≡ `sm:dark:`); every
named condition must hold.

## 5. Expo Go coverage gap

The JS fallback covers: layout, spacing, border/radius, plain colors,
font-weight, text-transform/decoration, line-height, letter-spacing,
shadows, and the RN-representable transforms (`translate-x/y`,
`scale`/`scale-x/y`, `rotate`/`rotate-x/y/z`, `skew-x/y`, `transform-none`,
`backface-*`).

Not covered: grid, filters, gradients, DOM-only typography, and transforms
with no RN equivalent (`translate-z`, `scale-z`, `perspective*`, `origin`,
`transform-gpu/cpu`). Same scope native itself excludes. Typo warnings are
also unavailable in Expo Go (no full-vocabulary resolver to check against).

This is also exactly what iOS gets in every build type (§3) — the coverage
gap isn't Expo-Go-specific, it's "whatever the JS-fallback engine covers."

## 6. Dark mode

Zero setup on all targets. On native `dark:` is resolved from a live
parameter every render — no build step to keep in sync. Expo Web defaults
to the `'attribute'` strategy.

```tsx
import { useTheme } from '@kbach/react-native';
const { mode, isDark, setMode, toggle } = useTheme();
```

No provider required. `<ThemeProvider>` optionally seeds a startup
`defaultMode` and enables persistence:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
<ThemeProvider persist={AsyncStorage}><App /></ThemeProvider>;
```

Mount at most one — dark mode is one global store, not scoped per
provider, so a second mounted instance logs a dev-only warning (they'd
fight over the same `defaultMode`/`persist` seed).

`persist` takes any `{ getItem, setItem }` async store. The persisted mode
is read once on mount and wins over `defaultMode`; later changes are
written back. This package never imports a storage library itself.

Outside React: `getGlobalDarkMode()` / `toggleGlobalDarkMode()` /
`setGlobalThemeMode()`.

## 7. `calc()` / `min()` / `max()` / `clamp()`

- **Constant** px/rem/bare-number expressions are reduced at resolve time:
  `p-[calc(16px+8px)]` → `padding: 24`. No spaces or underscores are
  required around operators; `calc(16px+8px)` is fine.
- **Viewport-relative** (`calc(10vw+8px)`): no such unit on native — the
  declaration is dropped and a dev-only `console.warn` explains why.
- **Percentage-relative `width`/`height`** (`w-[calc(100%-3rem)]`,
  `w-[min(50%,20rem)]`, `w-[clamp(16rem,50%,32rem)]`): supported via a
  one-frame measure-then-snap — renders at `100%`, measures via
  `onLayout`, then corrects to the computed number; re-measures on layout
  changes. Narrow shapes only: `calc()` = one percent term + one constant
  term; `min`/`max` args each a plain percent OR a constant expression (not
  mixed); `clamp` exactly three args; `width`/`height` only.
- **Literal spaces are illegal inside `[...]`** on any Tailwind-family
  engine (a space splits the class token). Use underscores if you want them
  for readability: `w-[calc(100%_-_3rem)]`.

## 8. Dynamic tokens (native counterpart to CSS custom properties)

```tsx
import { setDynamicToken, useDynamicToken } from '@kbach/react-native';

setDynamicToken('sidebar-width', '240px');
<View className="w-[var(--sidebar-width)]" />;
const w = useDynamicToken('sidebar-width'); // '240px' | undefined, reactive
```

On web `setDynamicToken` writes a real CSS custom property (browser
repaints, no re-render). On native the token value is substituted into the
class string before each resolve, and subscribed elements re-render on
change. `var(--x)` in a `className` already works unaided on Expo Web.

**Call `setDynamicToken` synchronously from a render body, not from module
top-level.** It calls `notify()` synchronously (dynamicTokens.ts), which
synchronously re-renders every already-mounted `ReactiveElement` subscribed
via `useSyncExternalStore` — safe when nothing is subscribed yet, a real
hazard once something is. Module-top-level code runs whenever Metro's
inline-requires first evaluates that module, which is NOT a fixed point in
the app's lifecycle — it can land in the middle of React rendering some
unrelated component elsewhere in the tree, which is exactly the "Cannot
update a component while rendering a different component" class of bug:

```tsx
// Bad — races Metro inline-requires; can fire mid-render of an unrelated component.
setDynamicToken('accent', '#8b5cf6');

// Good — call synchronously in your ROOT component's own render, before any
// consumer mounts; guard so it only ever fires once (unguarded, every
// re-render would call notify() again, wastefully re-rendering every
// subscribed element for no value change).
function RootLayout({ children }) {
  if (getDynamicToken('accent') === undefined) {
    setDynamicToken('accent', '#8b5cf6');
  }
  return <ThemeProvider>{children}</ThemeProvider>;
}
```

## 9. Reading colors as values

```tsx
import { useColors } from '@kbach/react-native';

const colors = useColors();
colors.blue[6];        // '#2563eb'
colors.blue['6/50'];   // 50% opacity
colors.alpha(colors.blue[6], 30);
colors.get('brand');   // a custom color, typed as plain `string`
```

`colors.blue[6]` returns the same value in both light and dark mode
unless `blue-6` itself is defined in the theme as a `{ light, dark }` pair
(§5.1 of the root AGENTS.md) — define a color as mode-aware in
`kbach.config.js` if you want it to differ by mode.

`colors.brand` (a custom flat color) is typed `string | ColorScale`
because the same object also serves shade families and TS can't tell them
apart statically — use `colors.get(name)` when you need a guaranteed
`string`.

## 10. Unknown-class warnings

On a native dev-client/CLI build, a class matching no Kbach utility on any
platform emits a one-time `console.warn` (dev only). A real utility native
just doesn't support yet (`grid-cols-3`, `blur`, …) stays silent — that's a
documented platform gap, not a typo. Not available in Expo Go.

A malformed or misused value fails the same safe way — a deduped, dev-only
`console.warn` naming the offending class and the fix, never a crash or
silently-wrong output. Confirmed across CSS-injection attempts in an
arbitrary value, invalid `calc()` operands, and double-mounted providers.

## 11. Monorepo / workspace installs

If `@kbach/react-native` is a workspace/hoisted dependency, Metro can end
up with **two physical copies of `react-native` / `react`** — different
files resolve to different module instances, and a dark-mode toggle can
silently do nothing. Force a single instance in your app's
`metro.config.js` via `resolver.resolveRequest`, pointing `react-native`
and `react` at `projectRoot/node_modules/...`. A plain non-monorepo
`npm install` never hits this.

## 12. Exports

`setTheme`, `getTheme`, `defaultTheme`, `resolveStyle`, `resolveKbachConfig`,
`applyKbachConfig`, `useTheme`, `ThemeProvider`, `useColors`,
`setDynamicToken`, `getDynamicToken`, `deleteDynamicToken`,
`subscribeDynamicTokens`, `useDynamicToken`, `clsx`, `getGlobalDarkMode`,
`getGlobalThemeMode`, `setGlobalThemeMode`, `toggleGlobalDarkMode`,
`subscribeGlobalDarkMode`. Types: `ThemeConfig`, `ColorEntry`,
`ContainerConfig`, `StyleObject`, `KbachConfig`, `ThemeState`,
`ThemeProviderProps`, `ThemeStorageAdapter`, `ThemeMode`, `ColorsAPI`,
`ColorScale`, `ClassValue`.

Subpath exports: `@kbach/react-native/babel-plugin`,
`@kbach/react-native/jsx-runtime`, `@kbach/react-native/jsx-dev-runtime`.

## 13. Common failure modes

- **`bg-<custom>` renders nothing** — the color is mode-aware
  (`{light,dark}` / `dark:` block) and the app is on a stale
  `@kbach/react-native` (`< 1.0.0-beta.36`). Update.
- **A `dark:` variant loses to a plain class** — stale
  `@kbach/react-native` (`< 1.0.0-beta.37`); class-order independence
  landed there. Update.
- **`useColors().brand` type error** — assign via `colors.get('brand')`
  (`< beta.36` has no `.get`).
- **Dark toggle does nothing in a monorepo** — duplicate `react-native` /
  `react` instances; add the `metro.config.js` `resolveRequest` override
  (§11).
- **Rust change not reflected on a real Android build** — stale prebuilt
  `.so`; the maintainer must re-run `build:android` and republish.
- **`kbach.config.js` "does nothing" / Metro bundling error** — an
  unquoted hyphenated key (`surface-dim:` instead of `'surface-dim':`).
  Quote it.
- **TypeScript error on `className`** (`Property 'className' does not
  exist on type ... ViewProps ...`) — fixed in `>= 1.0.0-beta.46`; update.
- **`className` does absolutely nothing — no styling, no warning, no
  error, on any target including Expo Go** — the babel plugin (§1) is
  missing. It's required on every target, not just Android/dev-client
  builds; without it nothing routes `className` through this package's
  jsx-runtime at all, so RN just silently ignores the unrecognized prop.
- **`ERROR [Error: Unable to find node on an unmounted component.]` on
  Expo Fast Refresh, especially right after editing `kbach.config.js`** —
  stale `@kbach/react-native` (`< 1.0.0-beta.51`). Root cause: the babel
  plugin (§1) injects `applyKbachConfig(require('kbach.config.js'))` into
  *every* user file, so editing that config forces Metro to re-execute the
  entire app (every file requires it), not just the screen you're on;
  before beta.51, `setTheme` (`theme.ts`) handed every one of those
  redundant re-applications a brand-new theme object even when the config
  content hadn't changed, invalidating every `useColors()` memo and
  reactive-element check across the whole tree simultaneously, right as
  Fast Refresh was already mid-teardown — worsening this normally-rare
  React Native Fast Refresh race. `setTheme` is idempotent by content
  since beta.51 (compares against the theme's own JSON serialization
  before replacing it); update.
