# Kbach — reference for AI assistants

The shared/cross-package reference: what Kbach is, `kbach.config.js`
(read by both bindings), the color palette, and how the underlying Rust
engine is built. Each binding's own package-specific reference — install,
setup, resolution model, modifiers, exports, failure modes — lives in that
package's own `AGENTS.md`, not here:

- [`packages/react/AGENTS.md`](packages/react/AGENTS.md) — `@kbach/react` (web)
- [`packages/react-native/AGENTS.md`](packages/react-native/AGENTS.md) — `@kbach/react-native`
- [`packages/browser/AGENTS.md`](packages/browser/AGENTS.md) — `@kbach/browser`, the no-build CDN `<script>`
- [`packages/cli/AGENTS.md`](packages/cli/AGENTS.md) — `@kbach/cli`, the setup-automation CLI
- [`packages/vscode-extension/AGENTS.md`](packages/vscode-extension/AGENTS.md) — `kbach-vscode`, the editor extension

The user-facing package READMEs are deliberately short; these `AGENTS.md`
files are the authoritative reference.

> **Before writing a single class, read this.** Kbach's class vocabulary
> LOOKS like Tailwind CSS — same utility names, same `dark:`/`hover:`/
> `sm:` modifier syntax, same `bg-`/`text-`/`p-` prefixes — closely enough
> that pattern-matching on Tailwind muscle memory silently produces wrong
> or non-resolving classes in three specific, easy-to-miss ways:
>
> 1. **Shades are `1`–`12`, NOT Tailwind's `50`–`950`.** `bg-blue-500` is
>    not a Kbach class — it silently resolves to nothing (an "Unknown
>    class" warning, not a visible color). The real class is `bg-blue-6`
>    (`1` = lightest, `12` = darkest — the numbering is inverted from
>    Tailwind's too, not just rescaled). See §7.
> 2. **On `@kbach/react-native` specifically, a large chunk of real
>    Tailwind has no native equivalent at all and silently does nothing**:
>    `group-*`, `peer-*`, `has-[…]`, container queries, grid, `before:`/
>    `after:` and other pseudo-elements. These PARSE without error and
>    apply zero style — there is no warning for "this is a real utility
>    native just doesn't support yet" (as opposed to a typo, which DOES
>    warn). See `packages/react-native/AGENTS.md` §4.
> 3. **An arbitrary value's unit matters more on native than on web.**
>    `text-[20px]`/`w-[2rem]` work; `text-[2em]`/`w-[50%]`/`h-[10vh]` on
>    native need real layout/cascade context that doesn't exist at
>    resolve time and get dropped (dev-only warning, not a crash) unless
>    they're one of the specific measured/reduced shapes
>    `packages/react-native/AGENTS.md` §7/§7.1 documents. Web has none of
>    this restriction.
>
> When in doubt about whether a specific class/value/modifier is
> supported, don't guess from Tailwind familiarity — check the relevant
> package's own AGENTS.md, or run `npx @kbach/cli doctor` / rely on the
> dev-time "Unknown class ... Typo?" warning, which is real and accurate
> for a genuine typo (as opposed to the silent-no-op cases above, which
> are real utilities on a platform that doesn't support them yet).

---

## 1. What Kbach is

A utility-first styling engine — the same class-name vocabulary as Tailwind
CSS v4, plus Kbach's own 22-family color palette — with a **shared Rust
core** compiled to different targets, and two thin bindings on top:

| Package | Target | Resolution model |
| :-- | :-- | :-- |
| `@kbach/core-engine` | Rust → WASM (web) + JNI `.so` (Android). Consumed by the two below; not used directly. | Parser + resolvers. |
| `@kbach/react` | Web / DOM | Class strings are scanned at **build time** and compiled to a real CSS file. |
| `@kbach/react-native` | Android (JNI), Expo Web (WASM), Expo Go (JS fallback) | Class strings are resolved to a **style object at render time**. |
| `@kbach/browser` | Plain HTML via a CDN `<script>` (no bundler, no React) | Class strings in the page are resolved **in the browser at load time** (WASM) and watched for changes. Bundles `@kbach/react`'s runtime from source — see [`packages/browser/AGENTS.md`](packages/browser/AGENTS.md). |
| `@kbach/cli` | Node CLI | Not a runtime dependency — automates the setup below via codemods (`init`) and read-only diagnostics (`doctor`). |
| `kbach-vscode` | VS Code extension | Not a runtime dependency — `className` completion/hover/diagnostics in the editor, validated against the real engine. |

Both bindings read the same optional `kbach.config.js` and expose the same
`useTheme()` / `useColors()` / dark-mode API.

---

## 2. `@kbach/react` (web)

Install, build-plugin wiring (Vite/PostCSS), the runtime `kb()`/
jsx-runtime paths, dark mode, plugin options, and the full exports list
— see [`packages/react/AGENTS.md`](packages/react/AGENTS.md). `npx
@kbach/cli init` automates the Vite/PostCSS wiring below — see §4.

---

## 3. `@kbach/react-native`

Install/setup per target (Expo Go/Web/dev-client, React Native CLI), what
the babel plugin does, the three-engine resolution model (including why
iOS runs the JS fallback in every build type), the native modifier set,
`calc()`/dynamic tokens/colors-as-values, monorepo caveats, the full
exports list, and package-specific failure modes — see
[`packages/react-native/AGENTS.md`](packages/react-native/AGENTS.md).
`npx @kbach/cli init` automates the per-target setup below — see §4.

---

## 4. `@kbach/cli` (setup automation)

`npx @kbach/cli init` detects which of the four frameworks above a
project is (Vite/Next.js → `@kbach/react`; Expo/React Native CLI →
`@kbach/react-native`) and performs the install + config-file wiring
each package's own §1/§2 above documents by hand, via format-preserving
codemods (never string templating) that are safe to re-run at any time.
`npx @kbach/cli doctor` runs the equivalent read-only diagnostics with a
real exit code, usable as a CI gate. Full detail — detection logic, the
exact codemod per framework, the `doctor` check list, non-interactive/CI
behavior, failure modes — in
[`packages/cli/AGENTS.md`](packages/cli/AGENTS.md).

---

## 5. `kbach-vscode` (editor extension)

VS Code `className` completion, hover (resolved CSS value + a color
swatch), inline diagnostics (unknown class with a one-click typo
quick-fix, plus a React-Native-only "parses but applies no style here"
warning for `group-*`/`peer-*`/grid/pseudo-elements/etc.), and a native
color picker for arbitrary color values — all validated against the real
engine (via its Node-target WASM build, vendored into the extension's
own `dist/` rather than depended on live — see that package's own
AGENTS.md §1 for a real, confirmed gotcha around that), not a second
hand-maintained copy of its rules. It reads each project's own
`kbach.config.js` (§6) through a PORT of `@kbach/react`'s loader + merge
algorithm, so a change to §6's semantics has to be mirrored in
`packages/vscode-extension/src/kbachConfigResolve.ts` /
`kbachConfigLoader.ts` too. Autocomplete's utility list is scraped
fixture tokens plus an engine-verified generated spacing-scale set — not
an exhaustive enumeration, a known, documented limit. Full detail in
[`packages/vscode-extension/AGENTS.md`](packages/vscode-extension/AGENTS.md).

---

## 6. `kbach.config.js` (shared by both bindings, and read by `kbach-vscode`)

A plain JS module exporting a `KbachConfig`. On web the plugin
auto-discovers it at the project root; on native the babel plugin
auto-applies it. Same shape either way. `kbach-vscode` (§5) also loads it
(from the nearest `package.json` directory above the edited file) so
editor diagnostics/completion know about custom colors and values.

```js
module.exports = {
  darkMode: 'media',        // 'media' (default) | 'attribute' | 'class'
  theme: { /* REPLACES a section of the defaults entirely */ },
  extend: { /* MERGES into the defaults — the common case */ },
};
```

> **Plain JavaScript, not JSON.** Any object key containing a hyphen must
> be quoted: `'surface-dim': '#121318'`. An unquoted `surface-dim:` is a
> syntax error and the whole file fails to load (on native this surfaces as
> a Metro bundling error).

### 6.1 `extend.colors`

Each value is a literal color OR a reference to another color name,
optionally with an `/opacity` suffix (0–100):

```js
colors: {
  brand: '#ff6b35',           // literal hex
  accent: 'orange-5',         // references a built-in palette color
  accentSoft: 'orange-5/50',  // ...at 50% opacity
  brandSoft: 'brand/30',      // references a color defined EARLIER in this object
  danger: 'red',              // not a known name -> literal CSS value
}
```

**Mode-aware colors** — two equivalent forms:

```js
// per-color pair
colors: { surface: { light: 'gray-2', dark: 'gray-11' } }

// grouped `dark` block (better when most colors are mode-aware)
colors: {
  surface: 'gray-2',
  card: 'white',
  dark: { surface: 'gray-11', card: 'gray-9' },
}
```

Both make `bg-surface` (no `dark:` prefix) resolve to the right shade for
the current mode. `dark` is a reserved key, not a color name. A name under
`dark` with no matching top-level entry is skipped. On `@kbach/react` a
mode-aware color compiles to a live `rgb(var(--kb-color-<name>))` CSS
variable; on native it resolves to the concrete side for the current
scheme at render time.

### 6.2 Other `extend` sections

```js
extend: {
  spacing: { 128: 512 },                            // p-128
  screens: { '3xl': 1920 },                          // 3xl:flex-row
  fontFamily: { display: '"Cal Sans", sans-serif' }, // font-display
  container: { center: true, padding: '2rem' },
}
```

`fontFamily` values are web-shaped fallback stacks even in the native
package — native strips them to the first name at resolve time, so the
same config works unmodified on Expo Web.

### 6.3 `theme` vs `extend`

`theme.colors` / `theme.spacing` / `theme.screens` / `theme.fontFamily`
**replace** the built-in section entirely (e.g. `theme.colors` drops the
default 22-family palette). `extend` merges on top. `container` only exists
under `extend` (it's inherently additive).

### 6.4 Runtime application

`resolveKbachConfig(config)` → a merged `ThemeConfig` (pure function).
`applyKbachConfig(config)` = `resolveKbachConfig` + `setTheme` + re-sync of
dark-mode DOM state. Call `applyKbachConfig` yourself only to change the
theme *after* startup (e.g. a per-user theme after login); the normal
build-time / babel-time path needs no call.

---

## 7. The palette

22 hue families (`gray`, `red`, `orange`, `amber`, `yellow`, `lime`,
`green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`,
`purple`, `fuchsia`, `pink`, `rose`, `slate`, `zinc`, `neutral`, `stone`),
shades `1`–`12` (**1 = lightest, 12 = darkest** — inverse of Tailwind's
50–950), plus `white`, `black`, `transparent`, `current`.

Used as classes (`bg-blue-6`, `text-gray-11`) or as values via
`useColors().blue[6]`. The shade file is generated from the Rust source of
truth (`generate-palette.mjs`), not hand-maintained in either binding.

---

## 8. How the engine is built

`@kbach/core-engine` is a Rust crate. `npm run build` in that package
produces:

- `wasm-pack build --target web` → `dist/` — used by `@kbach/react` and by
  `@kbach/react-native`'s Expo Web path. Vendored as a base64-embedded
  `.wasm` + a trimmed glue file so bundlers don't choke on
  `import.meta.url`.
- `wasm-pack build --target nodejs` → `dist-node/` — used by the build
  plugins (Vite/PostCSS) at compile time.
- `build:android` (cargo-ndk) → `libkbach_core_engine.so` for `arm64-v8a`
  and `x86_64`, copied into
  `packages/react-native/android/src/main/jniLibs/`. **These are prebuilt
  binaries committed into the package** — a Rust change does NOT rebuild
  them at a consumer's build time; the maintainer must re-run
  `build:android` and republish. Verify with a `strings` grep against the
  `.so` when in doubt.

Internal pipeline (shared by all targets): **parser** (tokenizes a class
into modifiers + utility + arbitrary value) → **registry** (maps each
modifier to its selector/media/pseudo behavior and an ordering tier) →
**resolvers** (per utility family: layout, spacing, color, border,
typography, effects, transform, …) → either **`css.rs`** (emits CSS text,
web) or **`resolve_style.rs`** (emits an RN style object, native). Web
gets cascade/specificity for free from CSS + the registry's per-modifier
`order` tiers; native reconstructs a small specificity model
(satisfied-modifier count) in `resolve_style.rs`.

### 8.1 Tailwind v4 parity: what matches, and the known differences

**Naming and licensing.** "Tailwind CSS" is a trademark of Tailwind Labs;
Kbach is independent and not endorsed by them. Public text says
"Tailwind CSS-compatible class names", never "Tailwind parity" or anything
implying affiliation, and every README carries the non-affiliation line.
Default theme values derived from Tailwind (MIT) require its notice:
`THIRD_PARTY_NOTICES.md` at the repo root is the single source, copied into
each package that ships the engine (`core-engine`, `react`,
`react-native`, `browser`, `vscode-extension`) by
`packages/core-engine/scripts/generate-notices.mjs` and listed in each
`files`. `npm run verify:generated` fails if a copy drifts. Edit only the
root file.

**Measured, not assumed.** Coverage is checked by running Tailwind's own
complete class list (`__unstable__loadDesignSystem(...).getClassList()`
from the `tailwindcss` package) through `generate_css`, with Tailwind's
palette rewritten to Kbach's (`red-500` → `blue-6`) so the check measures
utilities, not color names. As of 2026-11-07, against Tailwind 4.3.5:
**all 8,751 distinct utilities resolve (100%)**, up from 59.9%.
"Resolves" is necessary, not sufficient: each family was also checked
against Tailwind's own output, value by value. Re-run the comparison when
moving to a new Tailwind release; new families show up as gaps.

**How the newer families are built** (same designs as Tailwind's, with
`var()` fallbacks standing in for Tailwind's `@property` defaults, since
this engine emits no `@property` rules):
- **One composed `box-shadow`** (effects.rs `BOX_SHADOW_COMPOSE`): five
  layers, `inset-shadow`, `inset-ring`, `ring-offset`, `ring`, `shadow`.
  Each utility sets only its layer variable, and the drawing ones emit the
  identical composition, so `shadow-lg ring-2 inset-shadow-sm` shows all
  three in any order. (Before, `shadow-*` and `ring-*` each set
  `box-shadow` and erased each other.) `ring-offset-*`, `ring-inset` and
  the ring/shadow color utilities set only their variable.
- **Gradient masks** (mask.rs `resolve_gradient`): `mask-image` is always
  linear ∩ radial ∩ conic layers; the edge masks (`mask-t-from-50%`,
  `mask-x-to-20`) feed the linear layer, one gradient per side.
- **Recolorable shadows:** every `drop-shadow-*` and `text-shadow-*` size
  reads `--kb-drop-shadow-color`/`--kb-text-shadow-color`, which the color
  utilities set. A color class on its own draws nothing (Tailwind v4).
- **Composed `contain`:** `contain-size`/`-layout`/`-paint`/`-style` each
  set a slot, so any combination works.
- **`placeholder-<color>`** is parsed as `placeholder:text-<color>`
  (parser.rs), keeping the class as written for the selector.
  `divide-<color>` is an alias of `divide-color-<color>`.

**Values follow Tailwind v4.3**, including the scales v4 renamed or changed
from v3 (as of core-engine 1.0.0-beta.16; earlier releases used the v3
values). Checked value by value against Tailwind's own output:
- `rounded-sm` 0.25rem (v3's 0.125rem is `rounded-xs`); `rounded-4xl` 2rem.
- `shadow-sm` is v4's two-layer shadow (v3's `shadow-sm` is `shadow-xs`);
  `shadow-2xs` exists. Native's `shadowRadius`/`shadowOpacity` table
  follows the same scale.
- `blur-sm`/`backdrop-blur-sm` 8px (v3's 4px is `-xs`).
- `drop-shadow-xs` … `drop-shadow-2xl` and `text-shadow-2xs` …
  `text-shadow-lg` use v4's values. (Bare `text-shadow` isn't a Tailwind
  class; Kbach keeps it as an extra.)
- Bare `ring` is 1px with a `currentColor` default (v3: 3px, translucent
  blue). v3's look is `ring-3 ring-blue-6/50`. Ring, ring-offset, outline
  and outline-offset widths take any whole number (`ring-3`,
  `outline-offset-6`), not just v3's 0/1/2/4/8.
- `outline` is 1px; `outline-N` alone draws a solid outline; `outline-none`
  is `outline-style: none`; `outline-hidden` is invisible but survives
  forced-colors mode. Styles go through `--kb-outline-style`, so
  `outline-2 outline-dashed` works in either order.
- `text-xs` … `text-9xl` carry v4's default line-height, as
  `line-height: var(--kb-leading, <ratio>)`. Every `leading-*` sets
  `--kb-leading`, so it wins in either order. Web only: native keeps
  font-size alone, since RN line heights are absolute numbers.
- Bare `transition` uses v4's explicit property list (visual properties,
  not layout). `transition-all` is `all`.

**Remaining differences** (not value changes, just naming/shape):
- **Border colors between children** are `divide-color-*`, not
  `divide-*` (`divide-x`/`divide-y` are the width utilities), and
  `divide-x` uses physical left/right sides, not v4's logical inline ones.
- **Gradient stop positions** accept both Tailwind's `from-10%` and
  Kbach's original `from-10`.
- **`rotate-none`/`scale-none`** set the identity transform rather than
  the standalone CSS `rotate`/`scale` property, since Kbach composes every
  transform into one `transform` value. Same visual result.

**Never on native:** rings (a `var()`-built `box-shadow`), and generally
any CSS custom property or `var()`-containing value, which
`resolve_style.rs` (and the JS port's `resolveStyle.ts`) drop before
building the RN style. They exist only to make web cascades
order-independent; native used to receive them as bogus keys such as
`KbRingWidth`.

**Transitions get Tailwind's defaults:** every `transition-*` emits
`transition-duration: var(--kb-duration, 150ms)` and
`transition-timing-function: var(--kb-ease, cubic-bezier(0.4, 0, 0.2, 1))`,
and `duration-*`/`ease-*` set those two variables. The result is the same
whichever class lands later in the stylesheet (Tailwind's
`--tw-duration` technique).

**Web-only by design** (React Native has no equivalent, so these are
resolved in web-only dispatch paths and never reach native): table and
`list-item` displays, every logical utility (`ps`/`pe`/`ms`/`me`,
`pbs`/`pbe`/`mbs`/`mbe`, `inset-s`/`-e`/`-bs`/`-be`, `scroll-ms`/…,
`border-bs`/`-be`, `block-*`/`inline-*` viewport sizes), viewport units
(`h-dvh`, `w-svw`, `size-lvh`, …), `h-lh`, `max-w-none`/`max-h-none`,
`max-w-prose`, `*-safe`/last-baseline alignment, `flex-1/2`, masks,
`inset-shadow-*`/`inset-ring-*`, `contain-*`, `wrap-*`, and the `inherit`
color keyword. The native merge also drops `object-position` and
`container-type` (not RN styles; they used to leak through from
`object-*`/`@container`).

**Three engines must agree** on everything native: the Rust web resolver,
the Rust native resolver, and the Expo Go / iOS JS port
(`packages/react-native/src/jsEngine/`).
`packages/react-native/src/jsEngine/parity.test.ts` runs the same class
strings through the JS port and through Rust's `resolve_style_json` (from
`dist-node/`) and requires identical style objects. Add a case there for
any native-reaching resolver change.

---

## 9. Cross-package differences at a glance

| | `@kbach/react` | `@kbach/react-native` |
| :-- | :-- | :-- |
| When classes resolve | Build time (plugin scan) | Render time (per element) |
| Output | CSS file | RN style object |
| Full modifier set | Yes | Web target only; native has a documented subset |
| `dark:` | Plain CSS | Live parameter (native) / CSS (web) |
| Dynamic classes | `kb()` + `initKbach()` | Always dynamic; no init step |
| `calc()` with non-constant units | Real CSS | Constant reduced; `%` w/h measured; `vw`/`vh` dropped |
| Config discovery | Vite/PostCSS plugin | Babel plugin auto-apply |

---

## 10. Common failure modes

Shared across both packages, since `kbach.config.js` is read by both:

- **`kbach.config.js` "does nothing" / build error** — an unquoted
  hyphenated key. Quote it. (Web: `loadConfigFile` re-throws the syntax
  error, failing the build loudly. Native: surfaces as a Metro bundling
  error.)
- **Borders 4× too thick: `border-2` renders 8px, `border-t-4` 16px,
  `divide-x-2` 8px** — numbered border/divide widths went through the
  spacing scale (n × 4px) instead of meaning N px, on web, native AND
  Expo Go, in every release from `@kbach/core-engine` 1.0.0-beta.2 through
  1.0.0-beta.15. Fixed in core-engine 1.0.0-beta.16 (`border_width_px` in
  `resolvers/border.rs`, mirrored as `borderWidthPx` in the JS port);
  upgrade `@kbach/react`/`@kbach/react-native`/`@kbach/browser` to the
  releases built on it.
- **`transition-colors` (or any `transition-*`) animates nothing** —
  same releases as above: no default duration was emitted, so the
  transition ran in 0s unless a `duration-*` class was added. Fixed in the
  same release (Tailwind's 150ms default).
- **After upgrading to core-engine 1.0.0-beta.16, some elements look
  different** — that release moved every v3 value to Tailwind v4.3 (§8.1).
  Expected changes: `rounded-sm` larger, `shadow-sm` stronger, `blur-sm` /
  `backdrop-blur-sm` stronger, `drop-shadow-*` and `text-shadow-*` softer,
  bare `ring` thinner and in the text color, `outline-N` now visible
  without a style class, text sizes with tighter default line-heights, and
  bare `transition` no longer animating width/height. To keep a v3 look,
  use the renamed class (`rounded-xs`, `shadow-xs`, `blur-xs`,
  `ring-3 ring-blue-6/50`, `transition-all`). Also in that release:
  `shadow-*` and `ring-*` on the same element now both show (they used to
  erase each other); `ring-offset-N` alone no longer draws a ring; and
  `text-shadow-<color>` / `drop-shadow-<color>` alone draw nothing (pair
  them with a size, e.g. `text-shadow-md text-shadow-blue-6`).

Package-specific failure modes (stale-version symptoms, monorepo
duplicate-instance issues, prebuilt-binary staleness, …) live in each
package's own `AGENTS.md` — see
[`packages/react/AGENTS.md`](packages/react/AGENTS.md) §7 and
[`packages/react-native/AGENTS.md`](packages/react-native/AGENTS.md) §13.
