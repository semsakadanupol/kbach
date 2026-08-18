import { PALETTE } from './generatedPalette';

/** A plain hex color, or a mode-aware pair auto-expanded into a light/dark class pair by the Rust engine. */
export type ColorEntry = string | { light: string; dark: string };

export type DarkModeStrategy = 'attribute' | 'class' | 'media';

/**
 * Real Tailwind's `theme.container` config, mirroring
 * `packages/core-engine/src/theme.rs`'s `ContainerConfig` exactly (same
 * field names, `camelCase` on both sides via serde). `padding` is one
 * uniform value applied at every breakpoint (including below the smallest
 * one) rather than real Tailwind's optional per-breakpoint object form —
 * the common case in practice, and simpler to reason about; a
 * per-breakpoint padding map is a natural follow-up if ever needed.
 */
export interface ContainerConfig {
  center?: boolean;
  padding?: string;
}

export interface ThemeConfig {
  /** e.g. "blue-6" -> "#2563eb", or "surface" -> { light, dark } */
  colors: Record<string, ColorEntry>;
  /** e.g. "4" -> 16 (px) */
  spacing: Record<string, number>;
  /** e.g. "sm" -> 640 (min-width px) */
  screens: Record<string, number>;
  /**
   * e.g. "sans" -> "ui-sans-serif, system-ui, ...". Optional — the Rust
   * engine's own `font_family_value` already carries a hardcoded fallback
   * for "sans"/"serif"/"mono" (see its own doc comment) for when a theme
   * omits this field (or a name within it) entirely, matching this field's
   * `#[serde(default)]` on the Rust side. `defaultTheme` below still
   * populates all three explicitly, matching the Rust fallback strings
   * byte-for-byte, so a caller reading `defaultTheme.fontFamily.sans`
   * (e.g. to extend rather than replace it) gets the real value rather
   * than needing to already know the Rust-side fallback text.
   */
  fontFamily?: Record<string, string>;
  darkMode: DarkModeStrategy;
  /** Optional, matching `ContainerConfig`'s own `#[serde(default)]` on the Rust side — an omitted theme.container behaves exactly like `{}`. */
  container?: ContainerConfig;
}

// PALETTE (imported above) is Kbach's default color palette — generated
// from Rust (single source of truth: packages/core-engine/src/theme.rs's
// DEFAULT_COLORS), not hand-maintained here. Regenerate via
// 'npm run generate:colors' after changing the Rust side — see
// packages/core-engine/scripts/generate-palette.mjs.
export const defaultTheme: ThemeConfig = {
  colors: {
    ...PALETTE,
    surface: { light: '#f9fafb', dark: '#111827' },
  },
  // Real Tailwind's default spacing scale in full — every step is exactly
  // `n * 4px` (Tailwind's base spacing unit), including the fractional
  // `.5` steps (`1.5` -> 6px, `2.5` -> 10px, `3.5` -> 14px) and the "px"
  // literal (a bare 1px, for `p-px`-style hairline spacing). This table is
  // only the "usual stops", though — the Rust/JS engines' shared
  // `spacing_px`/`spacingPx` helper falls back to Tailwind v4's own live
  // `n * 4px` formula for any bare numeric step NOT listed here (`p-0.25`,
  // `gap-1.75`, `w-13`, ...), so this table exists to name the common
  // values and give a theme customization something to override, not to
  // enumerate every resolvable step. "px" is the one exception that must
  // stay listed explicitly — it isn't a number, so the formula can't
  // derive it.
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
  // falls back to — kept here too (rather than leaving this empty and
  // relying purely on the Rust-side fallback) so `defaultTheme.fontFamily.sans`
  // is a real, readable value for anything that wants to extend rather
  // than replace it (see `KbachConfig.extend.fontFamily` in config.ts).
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  darkMode: 'attribute',
  // Empty by default, matching real Tailwind's own defaults (no forced
  // centering/padding) — see `ContainerConfig`'s own doc comment.
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

/** Memoized JSON serialization of the active theme — passed across the WASM boundary. */
export function getThemeJson(): string {
  return activeThemeJson;
}
