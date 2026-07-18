# Kbach Framework — Complete AI Reference

Kbach is a Tailwind-like utility CSS framework for React (web) and React Native. Classes are written as `className` strings and resolved to inline styles at render time. On web, stateful and structural CSS rules are injected into a `<style>` tag so they work with the browser cascade. On native, only inline-compatible styles are applied.

Two packages:
- `@kbach/react` — React web (uses custom JSX runtime)
- `@kbach/native` — React Native / Expo (wraps `@kbach/react`, adds Babel preset + Metro config)

---

## Setup — @kbach/react (web)

### tsconfig.json
```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@kbach/react" } }
```

### vite.config.ts
Not installed by `@kbach/react` itself: `npm install -D vite @vitejs/plugin-react`.
```ts
import react from '@vitejs/plugin-react';
export default { plugins: [react({ jsxImportSource: '@kbach/react' })] };
```

### Per-file (no config needed)
```jsx
/** @jsxImportSource @kbach/react */
```

### Wrap app
```jsx
import { ThemeProvider } from '@kbach/react';
<ThemeProvider defaultMode="system"><App /></ThemeProvider>
```

### Next.js
- tsconfig `jsxImportSource` setup above applies as-is (SWC reads it like Vite does).
- No Vite plugin / static `kbach.css` for Next.js (webpack/Turbopack, not Vite) — falls back to runtime CSS injection, which only runs in the browser, so expect a brief flash of unstyled content on first paint before hydration. Known limitation.
- `@kbach/react`'s compiled output ships its own `"use client"` directive (`dist/index.js`, `dist/jsx-runtime.js`, `dist/jsx-dev-runtime.js`), so App Router Server Components can use `className`, `styled()`, hooks, and `<ThemeProvider>` directly — no manual `'use client'` wrapper needed.

### React Router
- Framework mode (v7, SSR): works via the same Vite setup above — it builds with Vite, and default scan dirs already include `app/`. Static `kbach.css` avoids the Next.js FOUC issue since there's no runtime-injection gap.
- Library mode (client-only): identical to any Vite + React app, no extra config.

---

## Setup — @kbach/native (React Native / Expo)

### babel.config.js
```js
const { createKbachConfig } = require('@kbach/native');
module.exports = createKbachConfig();
```

### Wrap app
```jsx
import { ThemeProvider } from '@kbach/native';
<ThemeProvider defaultMode="system"><AppContent /></ThemeProvider>
```

After changing babel.config.js: `npx expo start --clear`

---

## Core API

### className prop
Works on any element once the JSX runtime is active.
```jsx
<div className="bg-white dark:bg-gray-10 p-4 rounded-xl shadow" />
<p className="text-gray-10 text-lg font-bold" />
<button className="bg-blue-7 hover:bg-blue-8 rounded-lg px-4 py-2" />
```

### styled(Component, baseClasses)
Pre-style a component. Returns a new component that accepts a `kb` prop for extra classes.
```jsx
import { styled } from '@kbach/react'; // or @kbach/native

const Card   = styled('div', 'bg-white dark:bg-gray-9 rounded-2xl p-6 shadow');
const Button = styled('button', 'bg-blue-7 hover:bg-blue-8 rounded-xl px-6 py-3');

<Card kb="mt-4">          // merges mt-4 with base classes
<Button kb="w-full" />    // merges w-full with base classes
```

On web, `styled()` forwards the full class string as `className` so CSS rules (group-hover:, before:, print:) match the element.

### useStyles(classes)
Resolve classes to a style object inside a component.
```jsx
import { useStyles } from '@kbach/react';
const style = useStyles('bg-blue-6 px-3 py-1 rounded-full');
return <span style={style}>Badge</span>;
```

### kb(classes)
Resolve outside a component (static contexts).
```js
import { kb } from '@kbach/react';
const cardStyle = kb('bg-white p-4 rounded-xl') as React.CSSProperties;
```

### cx(...classes)
Conditionally join class strings. Falsy values ignored.
```jsx
import { cx } from '@kbach/react';
<div className={cx('p-4', isActive && 'border-2 border-blue-6', isDisabled && 'opacity-50')} />
```

### useTheme()
```ts
const { mode, resolvedMode, isDark, setMode, toggle, config } = useTheme();
// mode: 'light' | 'dark' | 'system'
// resolvedMode: 'light' | 'dark'
// isDark: boolean
// setMode(mode): void
// toggle(): void
// config: ResolvedConfig
```

### useIsDark()
```ts
const isDark = useIsDark(); // boolean
```

### useColors()
Returns a proxy over the active theme's color palette.
```ts
const colors = useColors();
colors.blue[6]            // '#3b82f6'
colors.blue['6/50']       // 'rgba(59,130,246,0.5)'
colors.white              // '#ffffff'
colors['white/20']        // 'rgba(255,255,255,0.2)'
colors.alpha('#ff6b35', 60) // 'rgba(255,107,53,0.6)'
```

---

## Modifier System

Up to 3 modifiers can be chained in any order before the utility name.

```
[modifier:][modifier:][modifier:]utility-value
dark:hover:bg-blue-8
sm:dark:text-lg
motion-reduce:transition-none
rtl:text-right
```

### Theme modifiers
| Modifier | Condition |
|---|---|
| `dark:` | Dark mode active |
| `light:` | Light mode active |
| `not-dark:` | Light mode active (alias) |
| `not-light:` | Dark mode active (alias) |

Dark mode strategy set in `ThemeProvider` or `kbach.config.js`:
- `'attribute'` (default) — `[data-theme="dark"]` on a wrapper element
- `'class'` — `.dark` class on a wrapper element
- `'media'` — `@media (prefers-color-scheme: dark)`

### Interaction modifiers
| Modifier | Triggers on |
|---|---|
| `hover:` | Mouse hover |
| `focus:` | Element focused |
| `focus-within:` | Focus anywhere inside element |
| `focus-visible:` | Keyboard focus ring |
| `active:` | Active state |
| `pressed:` | Click / touch pressed (alias for active on native) |
| `visited:` | Visited link |
| `disabled:` | Disabled element |
| `checked:` | Checkbox / radio checked |
| `placeholder:` | Input placeholder text |

Negated: `not-hover:`, `not-focus:`, `not-active:`, `not-pressed:`, `not-visited:`, `not-disabled:`, `not-checked:`

### Structural modifiers (CSS-injection only)
| Modifier | Pseudo-class |
|---|---|
| `first:` | `:first-child` |
| `last:` | `:last-child` |
| `odd:` | `:nth-child(odd)` |
| `even:` | `:nth-child(even)` |
| `only:` | `:only-child` |

### Responsive modifiers
| Modifier | Min-width |
|---|---|
| `sm:` | 576 px |
| `md:` | 768 px |
| `lg:` | 1024 px |
| `xl:` | 1280 px |
| `2xl:` | 1536 px |

On web, responsive styles are handled entirely via `@media (min-width)` CSS rules — no JS breakpoint tracking needed. On native, breakpoints are resolved from the current window width.

### Group / peer modifiers (CSS-injection only, web only)
Mark a parent with `group` (standalone class), then use `group-hover:` etc. on children.
Mark a previous sibling with `peer`, then use `peer-hover:` etc. on the next sibling.

```jsx
<div className="group">
  <span className="opacity-0 group-hover:opacity-100 transition" />
</div>
```

| Modifier | Fires when |
|---|---|
| `group-hover:` | Ancestor `.group` is hovered |
| `group-focus:` | Ancestor `.group` is focused |
| `peer-hover:` | Previous sibling `.peer` is hovered |
| `peer-focus:` | Previous sibling `.peer` is focused |

### Pseudo-element modifiers (CSS-injection only, web only)
```jsx
<div className="before:content-['*'] before:text-red-6 relative" />
<p className="first-letter:text-4xl first-letter:font-bold" />
<p className="selection:bg-blue-3" />
<input className="placeholder:text-gray-5" />
```

| Modifier | CSS selector |
|---|---|
| `before:` | `::before` |
| `after:` | `::after` |
| `selection:` | `::selection` |
| `first-letter:` | `::first-letter` |
| `first-line:` | `::first-line` |
| `marker:` | `::marker` |
| `placeholder:` | `::placeholder` |

### Print modifier (CSS-injection only, web only)
```jsx
<div className="print:hidden" />
<div className="print:text-black print:bg-white" />
```

### Orientation modifiers (CSS-injection only, web only)
```jsx
<div className="landscape:flex-row portrait:flex-col" />
```

| Modifier | Media query |
|---|---|
| `landscape:` | `@media (orientation: landscape)` |
| `portrait:` | `@media (orientation: portrait)` |

### Accessibility modifiers (CSS-injection only, web only)
```jsx
<div className="motion-reduce:transition-none motion-safe:transition-all duration-300" />
<div className="contrast-more:border-2 contrast-more:border-black" />
```

| Modifier | Media query |
|---|---|
| `motion-reduce:` | `@media (prefers-reduced-motion: reduce)` |
| `motion-safe:` | `@media (prefers-reduced-motion: no-preference)` |
| `contrast-more:` | `@media (prefers-contrast: more)` |
| `contrast-less:` | `@media (prefers-contrast: less)` |

### Directionality modifiers (CSS-injection only, web only)
```jsx
<div className="rtl:text-right ltr:text-left" />
<div className="rtl:pl-4 ltr:pr-4" />
```

| Modifier | CSS selector scope |
|---|---|
| `rtl:` | `[dir="rtl"] .cls` |
| `ltr:` | `[dir="ltr"] .cls` |

### Important modifier
Prefix any class with `!` to add `!important` to every CSS declaration it produces.
```jsx
<div className="!p-0 !m-0 !bg-transparent" />
```

---

## Arbitrary Values

Wrap any value in `[]` to use it directly.
```jsx
<div className="bg-[#6366f1]" />
<div className="p-[14px]" />
<div className="w-[calc(100%-2rem)]" />
<div className="text-[18px]" />
<div className="rounded-[20px]" />
<div className="bg-[rgba(99,102,241,0.15)]" />
<div className="grid-cols-[1fr_2fr_1fr]" />
<div className="will-change-[transform,opacity]" />
```

---

## Negative Values
Prefix any spacing utility with `-` for negative values.
```jsx
<div className="-mt-4" />   // marginTop: -16
<div className="-mx-2" />   // marginHorizontal: -8
<div className="-translate-x-2" />
```

---

## Color with Opacity
Append `/opacity` to any color utility. Opacity is 0–100 (integer) or arbitrary.
```jsx
<div className="bg-blue-6/50" />     // 50% opacity
<div className="text-gray-10/75" />  // 75% opacity
<div className="bg-black/[0.15]" />  // arbitrary opacity
```

---

## Color System

### 12-shade scale
1 = lightest, 12 = darkest. Maps to Tailwind v3 (50 → 1, 100 → 2, … 950 → 11, extra-dark → 12).

```
shade  1   2   3   4   5   6   7   8   9  10  11  12
       ─────────────────────────────────────────────
       light                                    dark
```

Usage: `bg-blue-6`, `text-gray-10`, `border-red-4/50`

### Color families (22 total)
Grays: `slate`, `gray`, `zinc`, `neutral`, `stone`
Colors: `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`
Special: `transparent`, `current` (currentColor), `black`, `white`

---

## Utility Reference

### Background
```
bg-{color}           backgroundColor
bg-{color}/{opacity} backgroundColor with alpha
bg-transparent       backgroundColor: transparent
bg-clip-border       -webkit-background-clip: border-box
bg-clip-padding      -webkit-background-clip: padding-box
bg-clip-content      -webkit-background-clip: content-box
bg-clip-text         -webkit-background-clip: text (web only)
bg-gradient-to-{dir} background linear gradient direction (web only)
  directions: t, tr, r, br, b, bl, l, tl
  use with: from-{color}, via-{color}, to-{color}
bg-blend-{mode}      background-blend-mode (web only)
  modes: normal, multiply, screen, overlay, darken, lighten,
         color-dodge, color-burn, hard-light, soft-light,
         difference, exclusion, hue, saturation, color, luminosity
```

### Text
```
text-{size}          fontSize: xs(12) sm(14) base(16) lg(18) xl(20)
                               2xl(24) 3xl(30) 4xl(36) 5xl(48)
                               6xl(60) 7xl(72) 8xl(96) 9xl(128)
text-{color}         color
text-left/right/center/justify  textAlign
text-wrap            text-wrap: wrap (web only)
text-nowrap          text-wrap: nowrap (web only)
text-balance         text-wrap: balance (web only)
text-pretty          text-wrap: pretty (web only)
```

### Font
```
font-thin/extralight/light/normal/medium/semibold/bold/extrabold/black
font-{family}        fontFamily (sans, mono, serif, or custom)
```

### Text decoration
```
underline            textDecorationLine: underline
overline             textDecorationLine: overline (web only)
line-through         textDecorationLine: line-through
no-underline         textDecorationLine: none
decoration-{color}   textDecorationColor (web only)
decoration-solid/dashed/dotted/double/wavy  textDecorationStyle (web only)
decoration-0/1/2/4/8/auto/from-font        textDecorationThickness (web only)
underline-offset-0/1/2/4/8/auto            textUnderlineOffset (web only)
```

### Text transform / case
```
uppercase            textTransform: uppercase
lowercase            textTransform: lowercase
capitalize           textTransform: capitalize
normal-case          textTransform: none
italic               fontStyle: italic
not-italic           fontStyle: normal
```

### Text overflow
```
truncate             overflow: hidden; white-space: nowrap; text-overflow: ellipsis
overflow-ellipsis    text-overflow: ellipsis (web only)
line-clamp-{n}       -webkit-line-clamp (web only, n = 1–20)
line-clamp-none      removes line-clamp (web only)
whitespace-normal/nowrap/pre/pre-wrap/pre-line  whiteSpace
break-normal/words/all/keep  word-break / overflow-wrap
```

### Typography misc
```
leading-{value}      lineHeight: none(1) tight(1.25) snug(1.375) normal(1.5)
                                 relaxed(1.625) loose(2), or numeric 3–10 (12–40px)
tracking-{value}     letterSpacing: tighter(-0.8) tight(-0.4) normal(0)
                                    wide(0.4) wider(0.8) widest(1.6)
antialiased          -webkit-font-smoothing: antialiased (web only)
subpixel-antialiased -webkit-font-smoothing: subpixel-antialiased (web only)
```

### Spacing — Padding
```
p-{n}    padding (all sides)
px-{n}   paddingHorizontal
py-{n}   paddingVertical
pt-{n}   paddingTop
pr-{n}   paddingRight
pb-{n}   paddingBottom
pl-{n}   paddingLeft
```

### Spacing — Margin
```
m-{n}    margin (all sides)
mx-{n}   marginHorizontal  (mx-auto centers on web)
my-{n}   marginVertical
mt-{n}   marginTop
mr-{n}   marginRight
mb-{n}   marginBottom
ml-{n}   marginLeft
```

Spacing scale (1 unit = 4px):
`px(1) 0 0.5(2) 1(4) 1.5(6) 2(8) 2.5(10) 3(12) 3.5(14) 4(16) 5(20) 6(24) 7(28) 8(32) 9(36) 10(40) 11(44) 12(48) 14(56) 16(64) 20(80) 24(96) 28(112) 32(128) 36(144) 40(160) 44(176) 48(192) 52(208) 56(224) 60(240) 64(256) 72(288) 80(320) 96(384) auto full(100%) 1/2 1/3 2/3 1/4 3/4 screen(100dvh) min max fit`

### Sizing
```
w-{n}            width
h-{n}            height
size-{n}         width + height
min-w-{n}        minWidth
min-h-{n}        minHeight
max-w-{n}        maxWidth
max-h-{n}        maxHeight

Named max-w sizes:
  max-w-none(none) max-w-xs(320) max-w-sm(384) max-w-md(448)
  max-w-lg(512) max-w-xl(576) max-w-2xl(672) max-w-3xl(768)
  max-w-4xl(896) max-w-5xl(1024) max-w-6xl(1152) max-w-7xl(1280)
  max-w-prose(65ch, web only)

Screen sizes (dvw/dvh — dynamic viewport units, correct on mobile where
browser chrome changes visible viewport size; vw/vh are pinned to the
largest viewport and overflow behind a shown address bar):
  w-screen(100dvw)   h-screen(100dvh)   size-screen not available
  min-w-screen(100dvw) max-w-screen(100dvw)
  min-h-screen(100dvh) max-h-screen(100dvh)
```

### Display
```
block           display: block
inline          display: inline
inline-block    display: inline-block
flex            display: flex
inline-flex     display: inline-flex
grid            display: grid (web only)
inline-grid     display: inline-grid (web only)
hidden          display: none
contents        display: contents (web only)
flow-root       display: flow-root (web only)
```

### Flex
```
flex-row/col/row-reverse/col-reverse  flexDirection
flex-wrap/nowrap/wrap-reverse          flexWrap
flex-1              flex: 1
flex-auto           flex: 1 1 auto
flex-initial        flex: 0 1 auto
flex-none           flex: none
flex-grow / flex-grow-0
flex-shrink / flex-shrink-0
grow / grow-0       flexGrow: 1/0
shrink / shrink-0   flexShrink: 1/0
basis-{n}           flexBasis
items-start/end/center/baseline/stretch   alignItems
justify-start/end/center/between/around/evenly  justifyContent
self-start/end/center/auto/stretch        alignSelf
content-start/end/center/between/around/evenly  alignContent
justify-items-start/end/center/stretch    justifyItems (web only)
justify-self-start/end/center/auto        justifySelf (web only)
order-{n}           order
gap-{n}             gap
gap-x-{n}           columnGap
gap-y-{n}           rowGap
```

### Grid (web only)
```
grid-cols-{n}       gridTemplateColumns: repeat(n, minmax(0,1fr))
grid-cols-none      gridTemplateColumns: none
grid-rows-{n}       gridTemplateRows
grid-rows-none      gridTemplateRows: none
grid-flow-row/col/dense/row-dense/col-dense  gridAutoFlow
auto-cols-auto/min/max/fr  gridAutoColumns
auto-rows-auto/min/max/fr  gridAutoRows
col-span-{n}        gridColumn: span n / span n
col-span-full       gridColumn: 1 / -1
col-start-{n}/auto  gridColumnStart
col-end-{n}/auto    gridColumnEnd
row-span-{n}        gridRow: span n / span n
row-span-full       gridRow: 1 / -1
row-start-{n}/auto  gridRowStart
row-end-{n}/auto    gridRowEnd
place-items-start/end/center/stretch    place-items
place-content-start/end/center/between/around/evenly/stretch  place-content
place-self-start/end/center/auto/stretch  place-self

Responsive grid example:
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div className="col-span-1 md:col-span-2">wide card</div>
</div>
```

### Position
```
static / relative / absolute / fixed / sticky   position
inset-{n}         top + right + bottom + left
inset-x-{n}       left + right
inset-y-{n}       top + bottom
top-{n} / right-{n} / bottom-{n} / left-{n}
z-{n}             zIndex: 0 10 20 30 40 50 auto
```

### Overflow
```
overflow-hidden/visible/scroll/auto/clip
overflow-x-hidden/visible/scroll/auto/clip
overflow-y-hidden/visible/scroll/auto/clip
```

### Border
```
border              borderWidth: 1
border-{n}          borderWidth: 0 2 4 8
border-t/r/b/l      border on one side
border-{color}      borderColor
border-opacity-{n}  border color opacity
border-solid/dashed/dotted/none  borderStyle
rounded             borderRadius: 4
rounded-none/sm/md/lg/xl/2xl/3xl/full
rounded-t/r/b/l     border radius on one side
rounded-tl/tr/bl/br border radius on one corner
```

### Shadow
```
shadow-sm/DEFAULT/md/lg/xl/2xl/none
```

### Opacity
```
opacity-0/5/10/15/20/25/30/40/50/60/70/75/80/90/95/100
```

### Ring
Web: box-shadow ring (no layout impact). Native: approximated via
borderWidth/borderColor (RN has no box-shadow) — this DOES affect layout
there, and shares its properties with `border-*`, so combining `border-*`
and `ring-*` on the same native element means whichever class comes last
wins. `ring-offset-*` stays web-only — there's no native way to add a gap
around an element without an extra wrapper view.
```
ring             ring (2px)
ring-{n}         ring width: 0 1 2 4 8
ring-{color}     ring color
ring-opacity-{n} ring opacity
ring-offset-{n}  ring offset: 0 1 2 4 8 (web only)
ring-offset-{color} (web only)
ring-inset       inset ring (web only — native has no inset/outset distinction)
```

### Outline (web only)
```
outline-none     outline: none
outline          outline: 2px solid transparent + offset 2px
outline-{n}      outlineWidth: 0 1 2 4 8
outline-{color}  outlineColor
outline-offset-{n}  outlineOffset: 0 1 2 4 8
```

### Transforms
```
scale-{n}        scale (0–150, step varies)
scale-x-{n}      scaleX
scale-y-{n}      scaleY
rotate-{n}       rotate in degrees
translate-x-{n}  translateX (uses spacing scale)
translate-y-{n}  translateY
skew-x-{n}       skewX
skew-y-{n}       skewY
origin-center/top/top-right/right/bottom-right/bottom/bottom-left/left/top-left
```

### Filters (web only)
```
blur-{n}           filter: blur
brightness-{n}     filter: brightness
contrast-{n}       filter: contrast
grayscale / grayscale-0
hue-rotate-{n}     filter: hue-rotate
invert / invert-0
saturate-{n}       filter: saturate
sepia / sepia-0
drop-shadow-{size} filter: drop-shadow

backdrop-blur-{n}
backdrop-brightness-{n}
backdrop-contrast-{n}
backdrop-grayscale
backdrop-hue-rotate-{n}
backdrop-invert
backdrop-opacity-{n}
backdrop-saturate-{n}
backdrop-sepia
backdrop-filter (enable backdrop filter)
filter (enable filter)
```

### Animation & Transition
```
animate-spin        rotate 360deg loop
animate-ping        scale + fade ping
animate-pulse       opacity pulse
animate-bounce      translate-y bounce

transition          transition: all 150ms ease (web only)
duration-{n}        transitionDuration: 75 100 150 200 300 500 700 1000
delay-{n}           transitionDelay: 75 100 150 200 300 500 700 1000
```

### Cursor (web only)
```
cursor-auto / cursor-default / cursor-pointer / cursor-wait
cursor-text / cursor-move / cursor-not-allowed
cursor-grab / cursor-grabbing
cursor-zoom-in / cursor-zoom-out
cursor-crosshair / cursor-help / cursor-none
```

### Pointer events / User select (web only)
```
pointer-events-none / pointer-events-auto
select-none / select-text / select-all / select-auto
```

### Touch action (web only)
```
touch-auto / touch-none / touch-pan-x / touch-pan-y
touch-pan-left / touch-pan-right / touch-pan-up / touch-pan-down
touch-pinch-zoom / touch-manipulation
```

### Scroll (web only)
```
scroll-smooth     scroll-behavior: smooth
scroll-auto       scroll-behavior: auto
```

### Float & Clear (web only)
```
float-left / float-right / float-start / float-end / float-none
clear-left / clear-right / clear-both / clear-start / clear-end / clear-none
```

### Vertical align (web only)
```
align-baseline / align-top / align-middle / align-bottom
align-text-top / align-text-bottom / align-sub / align-super
```

### Visibility
```
visible           visibility: visible
invisible         visibility: hidden
sr-only           visually hidden but screen-reader accessible
not-sr-only       reverses sr-only
```

### List style
```
list-none / list-disc / list-decimal
```

### Appearance / Resize (web only)
```
appearance-none
resize / resize-none / resize-x / resize-y
```

### Box sizing (web only)
```
box-border        box-sizing: border-box
box-content       box-sizing: content-box
```

### Object fit (web only)
```
object-contain / object-cover / object-fill / object-none / object-scale-down
```

### Aspect ratio (web only)
```
aspect-auto       aspect-ratio: auto
aspect-square     aspect-ratio: 1 / 1
aspect-video      aspect-ratio: 16 / 9
aspect-{arbitrary} e.g. aspect-[4/3]
```

### Columns (web only)
```
columns-{n}       column-count: 1–12
columns-auto      column-count: auto
columns-{size}    column-width: 3xs(16rem) 2xs(18rem) xs(20rem) sm(24rem)
                               md(28rem) lg(32rem) xl(36rem) 2xl(42rem)
                               3xl(48rem) 4xl(56rem) 5xl(64rem) 6xl(72rem) 7xl(80rem)
```

### Caret / Accent (web only)
```
caret-{color}     caret-color
caret-auto        caret-color: auto
caret-transparent caret-color: transparent
accent-{color}    accent-color
accent-auto       accent-color: auto
```

### Mix blend / Background blend (web only)
```
mix-blend-{mode}  mix-blend-mode
bg-blend-{mode}   background-blend-mode
  modes: normal multiply screen overlay darken lighten color-dodge
         color-burn hard-light soft-light difference exclusion
         hue saturation color luminosity (plus-lighter for mix-blend only)
```

### Will-change (web only)
```
will-change-auto / will-change-scroll / will-change-contents / will-change-transform
will-change-[transform,opacity]   arbitrary
```

### Divide (web only, uses child combinator CSS)
```
divide-x-{n}      border between horizontal children
divide-y-{n}      border between vertical children
divide-{color}    divider color
divide-solid/dashed/dotted
```

### Space between
```
space-x-{n}       margin-left on children (> * + *)
space-y-{n}       margin-top on children
```

### Group / Peer standalones
```
group             standalone marker class (no styles, silences dev warning)
peer              standalone marker class
```

---

## Native-only Utilities

These only work in `@kbach/native` / React Native:
```
tint-{color}         tintColor (Image / icon tinting)
perspective-{n}      perspective transform
backface-hidden      backfaceVisibility: hidden
text-shadow          text shadow (small)
text-shadow-lg       text shadow (large)
```

---

## Web-only Utilities (gracefully ignored on native)

The following resolve to `null` on React Native and produce no warning:
`caret-*`, `accent-*`, `touch-*`, `float-*`, `clear-*`, `align-*` (vertical),
`line-clamp-*`, `scroll-smooth`, `scroll-auto`, `overflow-clip`,
`overflow-ellipsis`, `bg-clip-text`, `bg-gradient-to-*`,
`animate-*`, `transition`, `filter`, `backdrop-filter`,
`print:`, `before:`, `after:`, `selection:`, `first-letter:`, `first-line:`, `marker:`,
`landscape:`, `portrait:`, `motion-reduce:`, `motion-safe:`,
`contrast-more:`, `contrast-less:`, `rtl:`, `ltr:`,
`mix-blend-*`, `bg-blend-*`, `will-change-*`, `columns-*`, `aspect-*`,
`object-*`, `resize-*`, `appearance-none`, `box-border`, `box-content`,
`subpixel-antialiased`, `overflow-ellipsis`, `flow-root`, `contents`,
`grid`, `inline-grid`, `grid-cols-*`, etc.

---

## Theme Configuration

### kbach.config.js (project root)
```js
module.exports = {
  darkMode: 'attribute', // 'attribute' | 'class' | 'media'

  theme: {
    // Fully replace a scale
    colors: {
      brand: { 1: '#eff6ff', 6: '#3b82f6', 10: '#1e3a8a' },
    },
  },

  extend: {
    theme: {
      // Merge into existing scale
      colors: { brand: { 6: '#6366f1' } },
      spacing: { 18: 72, 22: 88 },
      fontSize: { '10xl': 160 },
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

### Runtime update
```js
import { updateConfig } from '@kbach/react';
updateConfig({ extend: { theme: { colors: { brand: { 6: '#6366f1' } } } } });
// Always call clearCache() after updateConfig() to flush stale resolved styles.
```

### Default theme values
```
spacing:      1 unit = 4px (see Spacing section above)
fontSize:     xs–9xl (12–128px)
fontFamily:   sans('System') mono('Courier New') serif('Georgia')
fontWeight:   thin(100) extralight(200) light(300) normal(400) medium(500)
              semibold(600) bold(700) extrabold(800) black(900)
borderRadius: none(0) sm(2) DEFAULT(4) md(6) lg(8) xl(12) 2xl(16) 3xl(24) full(9999)
borderWidth:  DEFAULT(1) 0 2 4 8
opacity:      0 5 10 15 20 25 30 40 50 60 70 75 80 90 95 100
lineHeight:   none(1) tight(1.25) snug(1.375) normal(1.5) relaxed(1.625) loose(2) + 3–10 (12–40px)
letterSpacing:tighter(-0.8) tight(-0.4) normal(0) wide(0.4) wider(0.8) widest(1.6)
zIndex:       auto 0 10 20 30 40 50
screens:      sm(576) md(768) lg(1024) xl(1280) 2xl(1536)
```

---

## Common Patterns

### Dark mode card
```jsx
<div className="bg-white dark:bg-gray-9 rounded-2xl p-6 shadow-md">
  <h2 className="text-2xl font-bold text-gray-10 dark:text-white">Title</h2>
  <p className="text-gray-6 dark:text-gray-4 mt-2">Body text</p>
</div>
```

### Interactive button
```jsx
<button className="bg-blue-7 hover:bg-blue-8 active:bg-blue-9 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-xl transition" />
```

### Responsive layout
```jsx
<div className="flex flex-col md:flex-row gap-4">
  <aside className="w-full md:w-64 lg:w-80">…</aside>
  <main className="flex-1">…</main>
</div>
```

### Responsive grid
```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {items.map(item => <Card key={item.id} />)}
</div>
```

### Group hover reveal
```jsx
<div className="group relative overflow-hidden rounded-xl">
  <img src="…" className="transition group-hover:scale-105" />
  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
    <span className="text-white font-bold">View</span>
  </div>
</div>
```

### Reduced-motion safe animation
```jsx
<div className="motion-safe:animate-spin motion-reduce:opacity-75" />
```

### RTL-aware spacing
```jsx
<div className="ltr:pl-4 rtl:pr-4 ltr:text-left rtl:text-right" />
```

### Before/after pseudo-elements
```jsx
<div className="relative before:absolute before:inset-0 before:bg-blue-6/10 before:rounded-xl" />
```

### Input with caret and focus ring
```jsx
<input className="caret-blue-6 focus:ring-2 focus:ring-blue-5 focus:outline-none border border-gray-4 rounded-lg px-4 py-2" />
```

### Print-specific styles
```jsx
<nav className="print:hidden" />
<article className="print:text-black print:bg-white print:shadow-none" />
```

### Contrast accessibility
```jsx
<button className="bg-blue-6 contrast-more:bg-blue-9 contrast-more:border-2 contrast-more:border-blue-11 text-white">
  Submit
</button>
```

---

## Caching

The resolver uses an LRU cache (10,000 entries). Cache is automatically cleared on `updateConfig()`. Manually:
```js
import { clearCache } from '@kbach/react';
clearCache();
```

---

## Package Versions
- `@kbach/react`: see `packages/react/package.json`
- `@kbach/native`: see `packages/native/package.json` (depends on `@kbach/react`)
