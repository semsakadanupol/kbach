import { PALETTE } from './generatedPalette';

/**
 * A plain hex value (static — same in both modes), or a `{ light, dark }`
 * pair a caller sets manually in their own theme. Fully opt-in per color:
 * nothing here picks a "dark variant" automatically. Only `useColors()`
 * (a JS-value read, not a `className`) understands this shape — utility
 * CLASS resolution (`bg-blue-6`) on native/Expo Go stays plain-string-only,
 * same as it always was (dark mode for a CLASS is the separate `dark:`
 * modifier, gated live at resolve time — see `resolve_style.rs`); a
 * mode-aware entry referenced directly by a class name just doesn't
 * resolve there, mirroring `resolvers/color.rs`'s own `lookup_hex`
 * (`ColorValue::Plain` only, `ModeAware` -> `None`) exactly, same as it
 * would on the web engine too.
 */
export type ColorEntry = string | { light: string; dark: string };

/**
 * Real Tailwind's `theme.container` config, mirroring
 * `packages/core-engine/src/theme.rs`'s `ContainerConfig` exactly. `center`/
 * `padding` DO reach native now (unlike the max-width breakpoint ladder,
 * which is a `css.rs`-only concept with nothing to generate on native at
 * all) — `resolvers::layout::resolve`'s `"container"` arm is shared by both
 * dispatchers, and `margin`/`padding` are ordinary RN style properties.
 */
export interface ContainerConfig {
  center?: boolean;
  padding?: string;
}

// Kept as its own independent module rather than importing @kbach/react's
// ThemeConfig type — a bare RN project shouldn't need to install a
// web-oriented package just for a type.
//
// `screens` IS applied here (unlike the note this comment used to carry) —
// sm:/md:/lg:/xl:/2xl: are gated against it via a live window-width
// parameter at resolve time, the same "live parameter, not a build-time
// selector" shape `dark:`/`active:` already use. Same px values as
// @kbach/react's defaultTheme (its own single source of truth for these
// five numbers) — kept in sync by hand since there's no generated-file
// mechanism for this the way generatedPalette.ts has for colors.
export interface ThemeConfig {
  colors: Record<string, ColorEntry>;
  spacing: Record<string, number>;
  screens: Record<string, number>;
  /**
   * e.g. "sans" -> "Inter, sans-serif". Optional, matching the Rust
   * engine's own `#[serde(default)]`. Write it as a real web-shaped
   * fallback stack even on this native-first package — native's own
   * resolver strips it down to a single bare name at resolve time (RN's
   * `fontFamily` prop can't take a fallback list — see
   * `resolvers/mod.rs`'s `first_font_name`), so the SAME config still
   * works unmodified on Expo Web, which needs the full stack.
   */
  fontFamily?: Record<string, string>;
  darkMode: 'attribute' | 'class' | 'media';
  /** Optional, matching `ContainerConfig`'s own `#[serde(default)]` on the Rust side. */
  container?: ContainerConfig;
}

// PALETTE is generated from Rust (single source of truth:
// packages/core-engine/src/theme.rs's DEFAULT_COLORS), not hand-
// maintained here — same generated file @kbach/react's theme.ts uses.
// Regenerate via 'npm run generate:colors' after changing the Rust side —
// see packages/core-engine/scripts/generate-palette.mjs. Every entry here
// is a plain string (PALETTE's own type) — assignable to the wider
// ColorEntry-keyed colors field below without a cast.

export const defaultTheme: ThemeConfig = {
  colors: PALETTE,
  // Real Tailwind's default spacing scale in full — every step is exactly
  // `n * 4px`, including the fractional `.5` steps (`1.5` -> 6px, `2.5` ->
  // 10px, `3.5` -> 14px) and the "px" literal (a bare 1px). Only the
  // "usual stops", though — `jsEngine/shared.ts`'s `spacingPx` (and the
  // native Rust dispatcher's own `spacing_px`) falls back to Tailwind v4's
  // live `n * 4px` formula for any bare numeric step not listed here
  // (`p-0.25`, `w-13`, ...), so this table names the common values and
  // gives a theme override something to target, not the full resolvable
  // set. Mirrors @kbach/react's theme.ts exactly.
  spacing: {
    '0': 0, 'px': 1,
    '0.5': 2, '1': 4, '1.5': 6, '2': 8, '2.5': 10, '3': 12, '3.5': 14,
    '4': 16, '5': 20, '6': 24, '7': 28, '8': 32, '9': 36, '10': 40,
    '11': 44, '12': 48, '14': 56, '16': 64, '20': 80, '24': 96, '28': 112,
    '32': 128, '36': 144, '40': 160, '44': 176, '48': 192, '52': 208,
    '56': 224, '60': 240, '64': 256, '72': 288, '80': 320, '96': 384,
  },
  screens: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },
  // Byte-for-byte the same three stacks
  // packages/core-engine/src/resolvers/typography.rs's `font_family_value`
  // falls back to. On native these three still effectively no-op (see
  // `first_font_name`'s own doc comment for why a generic CSS keyword
  // isn't a real loadable font) — only a caller-configured custom name
  // changes native rendering; Expo Web uses the full stack as-is.
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  darkMode: 'attribute',
  // Empty by default, matching real Tailwind's own defaults.
  container: {},
};

// Named distinctly from the ALSO-named-`ThemeState` public type useTheme.ts
// exports (an unrelated `{isDark, mode, ...}` hook-return shape) — this one
// is purely internal to this module (never exported), but sharing the bare
// name across two different types in the same package risked real
// confusion, caught while writing this fix.
interface ActiveThemeState {
  theme: ThemeConfig;
  json: string;
}

/**
 * NOT a plain module-scope `let` — that was the actual bug (confirmed live
 * on Expo Web): `kbach.config.js`'s custom colors silently never reached
 * `useColors()`, with `colors.get('brandPrimary')` returning the literal
 * string `"brandPrimary"` instead of its real value — `useColors.ts`'s own
 * "no matching entry -> return the name itself" fallback, firing because
 * the entry genuinely was never there from THIS module instance's point of
 * view.
 *
 * Root cause: on web, THIS package is loaded through two genuinely
 * separate module instances in the SAME app bundle — Metro resolves a bare
 * `import ... from '@kbach/react-native'` through package.json's `import`
 * condition (`dist/index.web.mjs`) but the babel plugin's injected
 * `require('@kbach/react-native').applyKbachConfig(...)` (babel-plugin.js,
 * `buildConfigStatement`) always through `require` (`dist/index.web.js`)
 * — ESM and CJS builds are ALWAYS separate module graphs (confirmed by
 * tsup.config.ts's own module-level comment, written for a different but
 * related bug), so each one gets its OWN copy of every module-scope `let`
 * in this file, no matter what. `applyKbachConfig()` was writing the
 * custom theme into the `require`-side copy's `activeTheme`, while every
 * component's own `useColors()` — reached via a normal `import`, the same
 * way the rest of the app does — read the UNTOUCHED `import`-side copy,
 * which still had nothing but `defaultTheme`.
 *
 * `tsup.config.ts`'s own "web entries are unaffected... since dark:
 * resolves to real CSS + a DOM attribute write, not JS-side singleton
 * state" conclusion is correct for `darkModeStore.ts`, which is what that
 * comment was actually about — but it never applied to THIS module's
 * state, which IS plain JS-side data a component reads directly, not
 * CSS-mediated. The two files' web-safety are NOT the same claim, which is
 * exactly how this slipped through: the existing dual-instance fix (CJS-
 * sibling `external`s, tsup.config.ts) only dedupes WITHIN one format
 * (every CJS entry's `require('./theme')` resolves to the same `dist/
 * theme.js`); it structurally cannot dedupe ACROSS formats, since an ESM
 * build and a CJS build are never the same file on disk to begin with.
 *
 * `globalThis` is the one thing BOTH module instances can actually share
 * regardless of format — same JS runtime (same browser tab), so a plain
 * keyed slot on it works as a real cross-instance singleton with no build
 * change needed. The key is a distinctive, unlikely-to-collide string
 * rather than a bare property name, same spirit as how other libraries
 * dedupe an accidentally-doubled instance of themselves this way.
 */
const GLOBAL_STATE_KEY = '__kbachReactNativeThemeState__';

function getThemeState(): ActiveThemeState {
  const g = globalThis as unknown as Record<string, ActiveThemeState | undefined>;
  let state = g[GLOBAL_STATE_KEY];
  if (!state) {
    state = { theme: defaultTheme, json: JSON.stringify(defaultTheme) };
    g[GLOBAL_STATE_KEY] = state;
  }
  return state;
}

/**
 * Idempotent by CONTENT, not just a plain assignment — deliberately, not a
 * micro-optimization. The babel plugin (`babel-plugin.js`) injects
 * `applyKbachConfig(require('kbach.config.js'))` at the top of EVERY user
 * file, not just one entry point, so it re-runs on every single file
 * Metro (re-)executes. Editing `kbach.config.js` itself under Expo Fast
 * Refresh forces Metro to invalidate and re-execute every file that
 * requires it — which, because of that injection, is the entire app, not
 * just the file you're looking at. A plain unconditional reassignment here
 * would hand every one of those re-executions a BRAND NEW theme object
 * (`resolveKbachConfig` always builds one fresh) even when the config's
 * actual content hasn't changed, which in turn invalidates every
 * `useColors()` call's `useMemo` (keyed on this object's identity) and
 * re-evaluates `usesModeAwareColor()` for every reactive element
 * (jsxRuntimeCore.ts) across the whole tree, all at once, right as Fast
 * Refresh is already mid-teardown/rebuild for that same app-wide
 * invalidation — reported live as "Unable to find node on an unmounted
 * component," a known-flaky class of React Native Fast Refresh race that
 * this amount of simultaneous churn measurably worsens. Comparing against
 * the JSON serialization this function already computes (previously only
 * for the JNI boundary, see `getThemeJson`) costs nothing new — it's the
 * same computation the old code did unconditionally — it just skips the
 * assignment (and therefore the reference change every downstream
 * consumer sees) when the content is unchanged.
 */
export function setTheme(theme: ThemeConfig): void {
  const json = JSON.stringify(theme);
  const state = getThemeState();
  if (json === state.json) return;
  state.theme = theme;
  state.json = json;
}

export function getTheme(): ThemeConfig {
  return getThemeState().theme;
}

/** Memoized JSON serialization of the active theme — passed across the JNI boundary. */
export function getThemeJson(): string {
  return getThemeState().json;
}
