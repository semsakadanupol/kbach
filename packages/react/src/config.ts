import { defaultTheme, setTheme } from './theme';
import type { ColorEntry, ContainerConfig, DarkModeStrategy, ThemeConfig } from './theme';
import { parseHexRgb } from './colorVariables';
import { resyncDomWithActiveTheme } from './darkModeStore';

/**
 * A `kbach.config.js`-style theme customization, in one plain object — same
 * `theme`/`extend`/`darkMode` shape real Tailwind's own config file uses,
 * simplified from old-kbach's version (no plugins, no color alias chains
 * with cycle detection, no live-update-listener store): a config object
 * goes in, a resolved `ThemeConfig` comes out, via one PURE function
 * (`resolveKbachConfig`) — same input always produces the same output, so
 * nothing needs to stay "in sync" the way old-kbach's Babel-injected config
 * singleton did. Call it identically from a Node.js build script
 * (`vite.config.ts`) and from browser/app code (`applyKbachConfig`) and
 * both get the exact same theme, no synchronization mechanism required.
 */
export interface KbachConfig {
  /** Applied on top of `defaultTheme`; `undefined` means "keep the default". */
  darkMode?: DarkModeStrategy;
  /**
   * REPLACES the named section of `defaultTheme` entirely (e.g. supplying
   * `theme.colors` drops the rest of the default palette) — use `extend`
   * instead to add to the defaults rather than replace them. `container`
   * isn't here (only under `extend` below) — it has no "defaults to
   * replace" the way colors/spacing/screens/fontFamily do, since real
   * Tailwind's own container config is inherently additive (center/padding
   * on top of the always-present breakpoint ladder), so there's no
   * meaningful distinction between "replace" and "extend" for it.
   */
  theme?: Partial<Pick<ThemeConfig, 'colors' | 'spacing' | 'screens' | 'fontFamily'>>;
  /** Merges INTO `defaultTheme` (or `theme` above, if also supplied) — the common case. */
  extend?: {
    /**
     * A value is either a literal color (a hex string, or `{ light, dark }`
     * — same mode-aware shape `useColors()`/`useTheme()` already support)
     * or a REFERENCE to another color name, optionally with an opacity
     * suffix. Two things can be referenced:
     * - A BUILT-IN palette color, always available regardless of ordering
     *   (`accent: 'orange-5'`, `accentSoft: 'orange-5/50'`).
     * - A custom color defined EARLIER in this same object
     *   (`{ brand: '#ff6b35', brandSoft: 'brand/30' }` — `brandSoft`
     *   resolves to `brand`'s own value at 30% opacity, computed once here
     *   rather than needing a `colors.alpha()` call at every use site).
     * A string that doesn't match any known color name (built-in or
     * already-defined-above) is treated as a literal CSS value instead
     * (`accent: 'red'` — REAL CSS `red`, since there's no color named "red"
     * to alias), never an error either way.
     */
    colors?: Record<string, ColorEntry | string>;
    spacing?: Record<string, number>;
    screens?: Record<string, number>;
    /** Named font stacks, e.g. `{ display: '"Cal Sans", sans-serif' }` — adds to (or overrides one of) `defaultTheme.fontFamily`'s three names. */
    fontFamily?: Record<string, string>;
    /** `{ center: true, padding: '2rem' }` — see `ContainerConfig`'s own doc comment. */
    container?: ContainerConfig;
  };
}

/** `opacityText` is always a plain 0–100 percentage ("30" -> 30%) — no bracket/fraction shape to disambiguate the way a class-name slash suffix has, since this is a config VALUE, not parsed source text. */
function applyOpacityToHex(hex: string, opacityText: string): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return hex;
  const a = Number(opacityText) / 100;
  const clamped = Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1;
  return `rgba(${rgb.join(',')},${clamped})`;
}

/** Resolves a single `extend.colors` entry — see `KbachConfig.extend.colors`'s own doc comment for the alias/opacity rules. */
function resolveColorEntry(
  value: ColorEntry | string,
  lookup: (name: string) => ColorEntry | undefined,
): ColorEntry {
  if (typeof value !== 'string') return value;

  const slash = value.indexOf('/');
  const name = slash === -1 ? value : value.slice(0, slash);
  const opacity = slash === -1 ? undefined : value.slice(slash + 1);
  const base = lookup(name);
  if (base === undefined) return value; // not a known color name — a literal CSS value (hex, "red", "rgb(...)", ...)
  if (opacity === undefined) return base;
  return typeof base === 'string'
    ? applyOpacityToHex(base, opacity)
    : { light: applyOpacityToHex(base.light, opacity), dark: applyOpacityToHex(base.dark, opacity) };
}

function resolveColors(extend: Record<string, ColorEntry | string>, existing: Record<string, ColorEntry>): Record<string, ColorEntry> {
  const resolved: Record<string, ColorEntry> = {};
  const lookup = (name: string) => resolved[name] ?? existing[name];
  // Object.entries preserves declaration order, so an alias resolves
  // correctly as long as it's written AFTER the color it references —
  // the natural order anyone would write it in, and simpler to reason
  // about than old-kbach's depth-limited chain-walker.
  for (const [name, value] of Object.entries(extend)) {
    resolved[name] = resolveColorEntry(value, lookup);
  }
  return resolved;
}

/** Merges a `KbachConfig` into `defaultTheme` — a pure function, no side effects. */
export function resolveKbachConfig(config: KbachConfig): ThemeConfig {
  let theme: ThemeConfig = { ...defaultTheme, ...config.theme };

  if (config.extend?.colors) {
    theme = { ...theme, colors: { ...theme.colors, ...resolveColors(config.extend.colors, theme.colors) } };
  }
  if (config.extend?.spacing) {
    theme = { ...theme, spacing: { ...theme.spacing, ...config.extend.spacing } };
  }
  if (config.extend?.screens) {
    theme = { ...theme, screens: { ...theme.screens, ...config.extend.screens } };
  }
  if (config.extend?.fontFamily) {
    theme = { ...theme, fontFamily: { ...theme.fontFamily, ...config.extend.fontFamily } };
  }
  if (config.extend?.container) {
    theme = { ...theme, container: { ...theme.container, ...config.extend.container } };
  }
  if (config.darkMode) {
    theme = { ...theme, darkMode: config.darkMode };
  }

  return theme;
}

/**
 * `resolveKbachConfig()` + `setTheme()` in one call — the usual entry point
 * from app code. Returns the resolved theme (e.g. to also hand to the Vite
 * plugin's own `theme` option).
 *
 * Also re-syncs the DOM to the CURRENT dark-mode state right after
 * `setTheme()` — see `resyncDomWithActiveTheme`'s own doc comment for why
 * this is required, not optional: without it, an app that configures
 * `darkMode: 'attribute'`/`'class'` here can silently never apply its
 * `dark:` classes on initial load (even though `useTheme().isDark` reads
 * correctly) until some later, unrelated dark-mode event happens to fire.
 */
export function applyKbachConfig(config: KbachConfig): ThemeConfig {
  const theme = resolveKbachConfig(config);
  setTheme(theme);
  resyncDomWithActiveTheme();
  return theme;
}
