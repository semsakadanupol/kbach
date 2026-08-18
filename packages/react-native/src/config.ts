import { defaultTheme, setTheme } from './theme';
import type { ContainerConfig, ThemeConfig } from './theme';

/**
 * A `kbach.config.js`-style theme customization — same shape as
 * @kbach/react's `KbachConfig`, minus mode-aware `{ light, dark }` color
 * entries in `extend.colors` specifically: aliasing/opacity math here only
 * ever operates on plain hex (`brand: 'blue-6'`, `brandSoft: 'brand/30'`),
 * matching `jsEngine/resolvers/color.ts`'s `lookupHex`'s own Plain-only
 * convention — a reference to an EXISTING color that happens to be
 * mode-aware (`theme.colors` can hold those now, for `useColors()`; see
 * `theme.ts`'s own `ColorEntry` doc comment) just doesn't resolve as an
 * alias, falling through to "literal CSS value" the same way an unknown
 * name would. A config object goes in, a resolved `ThemeConfig` comes out,
 * via one PURE function (`resolveKbachConfig`) — no plugins, no
 * live-update store, nothing to keep "in sync."
 */
export interface KbachConfig {
  darkMode?: ThemeConfig['darkMode'];
  /**
   * REPLACES the named section of `defaultTheme` entirely — use `extend` to
   * add instead of replace. `container` isn't here (only under `extend`
   * below) — see @kbach/react's identical `KbachConfig.theme` doc comment
   * for why.
   */
  theme?: Partial<Pick<ThemeConfig, 'colors' | 'spacing' | 'screens' | 'fontFamily'>>;
  /** Merges INTO `defaultTheme` (or `theme` above, if also supplied) — the common case. */
  extend?: {
    /**
     * A value is either a literal hex color, or a REFERENCE to another
     * color name, optionally with an opacity suffix. Two things can be
     * referenced: a BUILT-IN palette color, always available regardless of
     * ordering (`accent: 'orange-5'`, `accentSoft: 'orange-5/50'`), or a
     * custom color defined EARLIER in this same object (`{ brand:
     * '#ff6b35', brandSoft: 'brand/30' }` — `brandSoft` resolves to
     * `brand`'s own value at 30% opacity). A string that doesn't match any
     * known color name is treated as a literal CSS value instead.
     */
    colors?: Record<string, string>;
    spacing?: Record<string, number>;
    screens?: Record<string, number>;
    /**
     * Named font stacks, e.g. `{ display: '"Cal Sans", sans-serif' }` —
     * adds to (or overrides one of) `defaultTheme.fontFamily`'s three
     * names. Write it as a real web-shaped fallback stack even though this
     * is the React Native package — native's own resolver strips it down
     * to a single bare name at resolve time (RN's `fontFamily` prop can't
     * take a fallback list), so the SAME config still works unmodified on
     * Expo Web, which needs the full stack.
     */
    fontFamily?: Record<string, string>;
    /** `{ center: true, padding: '2rem' }` — see `ContainerConfig`'s own doc comment. */
    container?: ContainerConfig;
  };
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyOpacityToHex(hex: string, opacityText: string): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return hex;
  const a = Number(opacityText) / 100;
  const clamped = Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 1;
  return `rgba(${rgb.join(',')},${clamped})`;
}

function resolveColorEntry(value: string, lookup: (name: string) => string | undefined): string {
  const slash = value.indexOf('/');
  const name = slash === -1 ? value : value.slice(0, slash);
  const opacity = slash === -1 ? undefined : value.slice(slash + 1);
  const base = lookup(name);
  if (base === undefined) return value; // not a known color name — a literal CSS value
  return opacity === undefined ? base : applyOpacityToHex(base, opacity);
}

function resolveColors(extend: Record<string, string>, existing: Record<string, import('./theme').ColorEntry>): Record<string, string> {
  const resolved: Record<string, string> = {};
  // A mode-aware EXISTING entry (theme.colors can hold those now, for
  // useColors()) is treated as "not found" for aliasing purposes — see
  // this module's own doc comment for why.
  const lookup = (name: string): string | undefined => {
    const found = resolved[name] ?? existing[name];
    return typeof found === 'string' ? found : undefined;
  };
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

/** `resolveKbachConfig()` + `setTheme()` in one call — the usual entry point from app code. */
export function applyKbachConfig(config: KbachConfig): ThemeConfig {
  const theme = resolveKbachConfig(config);
  setTheme(theme);
  return theme;
}
