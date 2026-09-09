import { useMemo } from 'react';
import { getTheme } from './theme';
import type { ColorEntry, ThemeConfig } from './theme';
import { useTheme } from './useTheme';

export interface ColorScale {
  /** `colors.blue[6]` -> raw value */
  readonly [shade: number]: string;
  /** `colors.blue['6/50']` -> shade 6 at 50% opacity */
  readonly [key: string]: string;
}

// A type intersection, not a single interface with both an index signature
// AND an explicit `alpha` member — see @kbach/react's useColors.ts for why
// (TypeScript requires every declared interface member to satisfy that
// interface's own index signature; `alpha`'s function type doesn't).
export type ColorsAPI = {
  /** `colors.white`, `colors.blue` (a shade family), ... */
  readonly [name: string]: string | ColorScale;
} & {
  /** Applies an opacity (0–100) to any color string this hook can return. */
  readonly alpha: (color: string, opacity?: number) => string;
  /**
   * Same lookup dot/bracket access does (`colors.get('brand')` ===
   * `colors.brand`), typed as plain `string` instead of `string |
   * ColorScale` — use this whenever the result goes somewhere that expects
   * a real `string` (a native style prop, a chart library) and hits a type
   * error otherwise. The wider union on every OTHER property here isn't a
   * bug: a flat custom color (`brand`) and a shade-family prefix (`blue`)
   * are served by the exact same object, and TypeScript has no way to
   * statically know which one any given key names — `kbach.config.js`'s
   * colors are plain runtime JS, not a type declaration this package could
   * inspect ahead of time. A name with no matching theme entry falls back
   * to the name itself, unresolved — the same "not a known color name ->
   * literal value" convention `kbach.config.js`'s own color aliasing
   * already uses (see `config.ts`'s `resolveColorEntry`), never an error.
   */
  readonly get: (name: string) => string;
};

function parseHexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function applyOpacity(color: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100));
  if (color.startsWith('#')) {
    const rgb = parseHexRgb(color);
    return rgb ? `rgba(${rgb.join(',')},${a})` : color;
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  if (color.startsWith('rgba(')) return color.replace(/,\s*[\d.]+\)$/, `,${a})`);
  return color;
}

/**
 * Resolves ONE color entry to a plain value — no CSS on this platform (not
 * even on Expo Web's react-native-web target, which this hook treats the
 * same as native for simplicity), so unlike @kbach/react's version there's
 * no live-CSS-variable option: a `{ light, dark }` entry always collapses
 * to whichever side matches the current `isDark`, straight from
 * `useTheme()`, the same way old-kbach's `useColors()` always did.
 */
function resolveEntry(entry: ColorEntry, isDark: boolean): string {
  return typeof entry === 'string' ? entry : isDark ? entry.dark : entry.light;
}

function makeColorsProxy(theme: ThemeConfig, isDark: boolean): ColorsAPI {
  const alpha = (color: string, opacity?: number) =>
    opacity === undefined ? color : applyOpacity(color, opacity);
  const cache = new Map<string, ColorScale>();

  function resolveNamed(key: string): string | undefined {
    let name = key;
    let opacity: number | undefined;
    if (key.includes('/')) {
      const slash = key.indexOf('/');
      name = key.slice(0, slash);
      opacity = Number(key.slice(slash + 1));
    }
    const entry = theme.colors[name];
    if (entry === undefined) return undefined;
    const value = resolveEntry(entry, isDark);
    return opacity === undefined ? value : applyOpacity(value, opacity);
  }

  function makeFamilyProxy(family: string): ColorScale {
    return new Proxy({} as ColorScale, {
      get(_, prop) {
        const key = String(prop);
        if (key === 'then') return undefined;
        return resolveNamed(`${family}-${key}`);
      },
    });
  }

  const get = (name: string): string => resolveNamed(name) ?? name;

  return new Proxy({ alpha, get } as unknown as ColorsAPI, {
    get(_, prop) {
      const key = String(prop);
      if (key === 'then') return undefined;
      if (key === 'alpha') return alpha;
      if (key === 'get') return get;
      const direct = resolveNamed(key);
      if (direct !== undefined) return direct;
      if (!cache.has(key)) cache.set(key, makeFamilyProxy(key));
      return cache.get(key)!;
    },
  });
}

/**
 * Resolved theme colors as real values — for anywhere you need an actual
 * color (a chart library prop, a raw SVG `fill`), not a `className`. Ported
 * from old-kbach's `useColors()`, adapted to this engine's flat
 * `"blue-6"`-keyed palette (`colors.blue[6]` looks up `"blue-6"`).
 *
 * Any color — a shade-family entry like `"blue-6"` or a standalone name —
 * can be defined in the theme as either a plain string (static, same in
 * both modes) or a `{ light, dark }` pair — fully manual, no automatic
 * shade-shifting or other assumption about what a "dark variant" should
 * be; see `resolveEntry`'s own doc comment for how a `{ light, dark }`
 * entry resolves on this platform specifically.
 *
 * ```ts
 * const colors = useColors();
 * colors.blue[6];        // "#2563eb" — static, same value in both modes
 * colors.blue['6/50'];   // same, at 50% opacity
 * colors.brand;          // resolves per isDark if defined as { light, dark }
 * colors.get('brand');   // same value as colors.brand, typed as plain `string`
 * ```
 */
export function useColors(): ColorsAPI {
  const { isDark } = useTheme();
  const theme = getTheme();
  // Memoized on (theme, isDark) — without this, every render (including
  // ones unrelated to color/theme, e.g. a parent re-rendering for its own
  // reasons) allocated a fresh Proxy + Map here for no reason, since the
  // resolved colors are a pure function of these two inputs.
  return useMemo(() => makeColorsProxy(theme, isDark), [theme, isDark]);
}
