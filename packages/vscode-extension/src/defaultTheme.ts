import { PALETTE } from './generatedPalette';

/** A plain hex color, or a mode-aware pair — mirrors `@kbach/react`'s own `ColorEntry` (packages/react/src/theme.ts), and the Rust engine's `ColorValue` (core-engine/src/theme.rs) accepts both shapes directly in the theme JSON. */
export type ColorEntry = string | { light: string; dark: string };

export interface ContainerConfig {
  center?: boolean;
  padding?: string;
}

export interface EngineTheme {
  colors: Record<string, ColorEntry>;
  spacing: Record<string, number>;
  screens: Record<string, number>;
  fontFamily: Record<string, string>;
  darkMode: 'attribute' | 'class' | 'media';
  container: ContainerConfig;
}

/**
 * The theme this extension resolves classes against when a workspace has
 * no `kbach.config.js` of its own — Rust's own default palette (`PALETTE`,
 * generated from `theme.rs`'s `DEFAULT_COLORS`, see generatedPalette.ts's
 * own comment) plus the same spacing/screens/darkMode/container defaults
 * `@kbach/react-native`'s `theme.ts` uses. `spacing` deliberately stays
 * empty rather than listing the full scale table: the real Rust resolver
 * falls back to its own `n * 4px` formula for any step not explicitly
 * present (confirmed in core-engine/src/resolvers/mod.rs's own tests),
 * which produces byte-identical results to the table for every DEFAULT
 * step — the table only matters once a `kbach.config.js`'s
 * `extend.spacing` needs to override a specific step away from that
 * formula (kbachConfigResolve.ts's whole job).
 *
 * NOT `@kbach/react`'s own `defaultTheme` — that one additionally bakes
 * in a JS-side-only `surface: { light, dark }` color entry that
 * `@kbach/react-native`'s `defaultTheme` does NOT have (confirmed by
 * reading both packages' theme.ts directly) — a real, undocumented
 * divergence between the two bindings' defaults, not something safe to
 * silently pick a side on here. This extension is binding-agnostic, so it
 * intentionally matches neither binding's divergent extra and only ever
 * reflects what a project's OWN `kbach.config.js` actually declares.
 */
export const DEFAULT_THEME: EngineTheme = {
  colors: PALETTE,
  spacing: {},
  screens: { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
  fontFamily: {},
  darkMode: 'media',
  container: {},
};
