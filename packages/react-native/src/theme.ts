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

let activeTheme: ThemeConfig = defaultTheme;
let activeThemeJson: string = JSON.stringify(defaultTheme);

export function setTheme(theme: ThemeConfig): void {
  activeTheme = theme;
  activeThemeJson = JSON.stringify(theme);
}

export function getTheme(): ThemeConfig {
  return activeTheme;
}

/** Memoized JSON serialization of the active theme — passed across the JNI boundary. */
export function getThemeJson(): string {
  return activeThemeJson;
}
