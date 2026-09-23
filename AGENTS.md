# Kbach — reference for AI assistants

The shared/cross-package reference: what Kbach is, `kbach.config.js`
(read by both bindings), the color palette, and how the underlying Rust
engine is built. Each binding's own package-specific reference — install,
setup, resolution model, modifiers, exports, failure modes — lives in that
package's own `AGENTS.md`, not here:

- [`packages/react/AGENTS.md`](packages/react/AGENTS.md) — `@kbach/react` (web)
- [`packages/react-native/AGENTS.md`](packages/react-native/AGENTS.md) — `@kbach/react-native`
- [`packages/cli/AGENTS.md`](packages/cli/AGENTS.md) — `@kbach/cli`, the setup-automation CLI

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
>    Tailwind's too, not just rescaled). See §6.
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
| `@kbach/cli` | Node CLI | Not a runtime dependency — automates the setup below via codemods (`init`) and read-only diagnostics (`doctor`). |

Both bindings read the same optional `kbach.config.js` and expose the same
`useTheme()` / `useColors()` / dark-mode API.

---

## 2. `@kbach/react` (web)

Install, build-plugin wiring (Vite/PostCSS), the runtime `kb()`/
jsx-runtime paths, dark mode, plugin options, and the full exports list —
see [`packages/react/AGENTS.md`](packages/react/AGENTS.md). `npx
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

## 5. `kbach.config.js` (shared by both bindings)

A plain JS module exporting a `KbachConfig`. On web the plugin
auto-discovers it at the project root; on native the babel plugin
auto-applies it. Same shape either way.

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

### 5.1 `extend.colors`

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

### 5.2 Other `extend` sections

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

### 5.3 `theme` vs `extend`

`theme.colors` / `theme.spacing` / `theme.screens` / `theme.fontFamily`
**replace** the built-in section entirely (e.g. `theme.colors` drops the
default 22-family palette). `extend` merges on top. `container` only exists
under `extend` (it's inherently additive).

### 5.4 Runtime application

`resolveKbachConfig(config)` → a merged `ThemeConfig` (pure function).
`applyKbachConfig(config)` = `resolveKbachConfig` + `setTheme` + re-sync of
dark-mode DOM state. Call `applyKbachConfig` yourself only to change the
theme *after* startup (e.g. a per-user theme after login); the normal
build-time / babel-time path needs no call.

---

## 6. The palette

22 hue families (`gray`, `red`, `orange`, `amber`, `yellow`, `lime`,
`green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`,
`purple`, `fuchsia`, `pink`, `rose`, `slate`, `zinc`, `neutral`, `stone`),
shades `1`–`12` (**1 = lightest, 12 = darkest** — inverse of Tailwind's
50–950), plus `white`, `black`, `transparent`, `current`.

Used as classes (`bg-blue-6`, `text-gray-11`) or as values via
`useColors().blue[6]`. The shade file is generated from the Rust source of
truth (`generate-palette.mjs`), not hand-maintained in either binding.

---

## 7. How the engine is built

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

---

## 8. Cross-package differences at a glance

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

## 9. Common failure modes

Shared across both packages, since `kbach.config.js` is read by both:

- **`kbach.config.js` "does nothing" / build error** — an unquoted
  hyphenated key. Quote it. (Web: `loadConfigFile` re-throws the syntax
  error, failing the build loudly. Native: surfaces as a Metro bundling
  error.)

Package-specific failure modes (stale-version symptoms, monorepo
duplicate-instance issues, prebuilt-binary staleness, …) live in each
package's own `AGENTS.md` — see
[`packages/react/AGENTS.md`](packages/react/AGENTS.md) §7 and
[`packages/react-native/AGENTS.md`](packages/react-native/AGENTS.md) §13.
