import { PALETTE } from './generatedPalette';

// Deliberately simpler than @kbach/react's theme.ts — no mode-aware color
// objects (dark: is applied on native via a live color-scheme parameter at
// resolve time, not via {light,dark} theme VALUES — see resolve_style.rs);
// base styles only. Kept as its own independent module rather than
// importing @kbach/react's ThemeConfig type — a bare RN project shouldn't
// need to install a web-oriented package just for a type.
//
// `screens` IS applied here (unlike the note this comment used to carry) —
// sm:/md:/lg:/xl:/2xl: are gated against it via a live window-width
// parameter at resolve time, the same "live parameter, not a build-time
// selector" shape `dark:`/`active:` already use. Same px values as
// @kbach/react's defaultTheme (its own single source of truth for these
// five numbers) — kept in sync by hand since there's no generated-file
// mechanism for this the way generatedPalette.ts has for colors.
export interface ThemeConfig {
  /** Plain hex only, this pass — e.g. "blue-6" -> "#2563eb" */
  colors: Record<string, string>;
  spacing: Record<string, number>;
  screens: Record<string, number>;
  darkMode: 'attribute' | 'class' | 'media';
}

// PALETTE is generated from Rust (single source of truth:
// packages/core-engine/src/theme.rs's DEFAULT_COLORS), not hand-
// maintained here — same generated file @kbach/react's theme.ts uses.
// Regenerate via 'npm run generate:colors' after changing the Rust side —
// see packages/core-engine/scripts/generate-palette.mjs. No mode-aware
// 'surface'-style entry (this package's ColorEntry is plain string only).

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

/** Memoized JSON serialization of the active theme — passed across the JNI boundary. */
export function getThemeJson(): string {
  return activeThemeJson;
}
