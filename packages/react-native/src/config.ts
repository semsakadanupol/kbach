import { defaultTheme, setTheme } from './theme';
import type { ColorEntry, ContainerConfig, ThemeConfig } from './theme';
import { resyncDomWithActiveTheme } from './darkModeStore';

/**
 * A `kbach.config.js`-style theme customization — same shape as
 * @kbach/react's `KbachConfig`, minus @kbach/react's own PER-COLOR
 * `{ light, dark }` object form in `extend.colors` specifically (real
 * mode-aware colors here are written via the grouped `dark` key instead —
 * see `KbachConfig.extend.colors`'s own doc comment below): aliasing/
 * opacity math on an individual color value here only ever operates on
 * plain hex (`brand: 'blue-6'`, `brandSoft: 'brand/30'`), matching
 * `jsEngine/resolvers/color.ts`'s `lookupHex`'s own Plain-only convention
 * — a reference to an EXISTING color that happens to be mode-aware
 * (`theme.colors` can hold those, for `useColors()`; see `theme.ts`'s own
 * `ColorEntry` doc comment) just doesn't resolve as an alias, falling
 * through to "literal CSS value" the same way an unknown name would. A
 * config object goes in, a resolved `ThemeConfig` comes out, via one PURE
 * function (`resolveKbachConfig`) — no plugins, no live-update store,
 * nothing to keep "in sync."
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
     *
     * `dark` is a reserved key, not a color name: a parallel map of
     * dark-mode overrides for any of the OTHER names in this same object —
     * `{ surface: 'gray-2', card: 'white', dark: { surface: 'gray-11',
     * card: 'gray-9' } }` makes `surface`/`card` mode-aware
     * (`{ light, dark }` entries in the resolved theme), while `brand`
     * (never mentioned under `dark`) stays a plain, mode-independent
     * color. A name under `dark` with no matching top-level (light) entry
     * is skipped — mode-aware colors need both sides written out, and
     * inventing a "light" value out of nowhere would be worse than just
     * not creating the entry at all. References inside `dark` resolve
     * against the built-in palette and OTHER entries within `dark` itself
     * (not against the light-side custom colors) — the same
     * "self-contained, ordering-independent-of-the-other-side" resolution
     * the light side already gets, just mirrored.
     */
    colors?: { [colorName: string]: string | Record<string, string> | undefined; dark?: Record<string, string> };
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

/**
 * Resolves every color in `extend.colors` — the plain (light/mode-
 * independent) entries first, then `dark`'s entries (if present) the exact
 * same way, each side resolving purely against ITSELF plus `existing` (the
 * built-in palette) — see `KbachConfig.extend.colors`'s own doc comment
 * for the full "dark is a reserved key, not a color name" reasoning. A
 * name is only mode-aware in the returned theme when it appears on BOTH
 * sides; a `dark`-only name is skipped (no light value to pair it with).
 */
function resolveColors(
  extend: { [colorName: string]: string | Record<string, string> | undefined; dark?: Record<string, string> },
  existing: Record<string, ColorEntry>,
): Record<string, ColorEntry> {
  const { dark: darkExtend, ...lightExtend } = extend;

  // A mode-aware EXISTING entry (theme.colors can hold those now, for
  // useColors()) is treated as "not found" for aliasing purposes — see
  // this module's own doc comment for why.
  const resolvedLight: Record<string, string> = {};
  const lookupLight = (name: string): string | undefined => {
    const found = resolvedLight[name] ?? existing[name];
    return typeof found === 'string' ? found : undefined;
  };
  for (const [name, value] of Object.entries(lightExtend)) {
    if (typeof value !== 'string') continue; // guards against a stray non-string value under a name other than "dark"
    resolvedLight[name] = resolveColorEntry(value, lookupLight);
  }

  const result: Record<string, ColorEntry> = { ...resolvedLight };
  if (darkExtend) {
    const resolvedDark: Record<string, string> = {};
    const lookupDark = (name: string): string | undefined => {
      const found = resolvedDark[name] ?? existing[name];
      return typeof found === 'string' ? found : undefined;
    };
    for (const [name, value] of Object.entries(darkExtend)) {
      resolvedDark[name] = resolveColorEntry(value, lookupDark);
    }
    for (const [name, darkValue] of Object.entries(resolvedDark)) {
      const lightValue = resolvedLight[name];
      if (lightValue === undefined) continue;
      result[name] = { light: lightValue, dark: darkValue };
    }
  }
  return result;
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
 * from app code. Also re-syncs the DOM (Expo Web only) to the CURRENT
 * dark-mode state right after `setTheme()` — see
 * `resyncDomWithActiveTheme`'s own doc comment for why this is required,
 * not optional.
 */
export function applyKbachConfig(config: KbachConfig): ThemeConfig {
  const theme = resolveKbachConfig(config);
  setTheme(theme);
  resyncDomWithActiveTheme();
  return theme;
}
