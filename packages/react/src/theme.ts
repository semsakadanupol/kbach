import { PALETTE } from './generatedPalette';

/** A plain hex color, or a mode-aware pair auto-expanded into a light/dark class pair by the Rust engine. */
export type ColorEntry = string | { light: string; dark: string };

export type DarkModeStrategy = 'attribute' | 'class' | 'media';

export interface ThemeConfig {
  /** e.g. "blue-6" -> "#2563eb", or "surface" -> { light, dark } */
  colors: Record<string, ColorEntry>;
  /** e.g. "4" -> 16 (px) */
  spacing: Record<string, number>;
  /** e.g. "sm" -> 640 (min-width px) */
  screens: Record<string, number>;
  darkMode: DarkModeStrategy;
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
  // literal (a bare 1px, for `p-px`-style hairline spacing). Previously
  // this only had {0,1,2,4,6,8} — a handful of spot-checked values, not
  // the real scale — so anything else (`p-3`, `w-5`, `border-2`, `gap-10`,
  // ...) silently failed to resolve (an unknown spacing key returns `None`
  // the same way an unknown class does, with no error). "0" itself is
  // still needed explicitly (not derivable as "any number * 4") for the
  // same reason it always was: `sticky top-0` needs an actual "0" key to
  // resolve at all, not just fall through as unresolvable.
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
  darkMode: 'attribute',
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
