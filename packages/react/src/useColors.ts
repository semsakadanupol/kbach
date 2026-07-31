import { useMemo } from 'react';
import { useTheme } from './context';
import { parseHexRgb, defaultColors, isModeAwareColor, type DefaultColorName } from './core';
import type { ThemeColors, ColorShades, ColorValue } from './core';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ColorScale {
  /** `colors.blue[6]` → raw hex string */
  readonly [shade: number]: string;
  /** `colors.blue['6/50']` → shade 6 at 50% opacity */
  readonly [key: string]: string;
}

// A named color is either a flat string (transparent, current, black, white, or
// a custom flat color) or a 1–12 shade scale (blue, red, or a custom scale).
// For a name that's part of the DEFAULT theme, this resolves to the PRECISE
// shape (string for flat colors, ColorScale for shade scales), derived from
// defaultColors' own literal type. For anything else — a custom color added
// via the ColorName type param below — it falls back to the union, since
// TypeScript can't see into a runtime-loaded kbach.config.js to know which
// shape a custom name actually has.
type ColorValueFor<K extends string> = K extends keyof typeof defaultColors
  ? (typeof defaultColors)[K] extends string ? string : ColorScale
  : ColorScale | string;

/**
 * `ColorName` defaults to the built-in theme's color names (`DefaultColorName`,
 * derived from `defaultColors` in core/theme.ts), so `useColors()` gets full
 * autocomplete and typo-catching out of the box for any project on the default
 * theme. A customized `kbach.config.js` isn't visible to TypeScript (it's a
 * plain .js file loaded at runtime, not a statically-analyzed module), so a
 * project with extra colors needs to widen the type parameter explicitly:
 * `useColors<DefaultColorName | 'brand'>()`.
 */
export type ColorsAPI<ColorName extends string = DefaultColorName> =
  { readonly [K in ColorName]: ColorValueFor<K> } & {
    /**
     * Pass any CSS color through, optionally applying an opacity (0–100).
     * - `colors.alpha('#3b82f6', 50)` → `'rgba(59,130,246,0.5)'`
     * - `colors.alpha('rgb(0,0,0)', 10)` → `'rgba(0,0,0,0.1)'`
     * - `colors.alpha('rgba(0,0,0,0.5)')` → `'rgba(0,0,0,0.5)'` (passthrough)
     */
    readonly alpha: (color: string, opacity?: number) => string;
  };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyOpacity(color: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100));
  if (color.startsWith('#')) {
    const rgb = parseHexRgb(color);
    if (!rgb) return color;
    const [r, g, b] = rgb;
    return `rgba(${r},${g},${b},${a})`;
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  if (color.startsWith('rgba(')) return color.replace(/,\s*[\d.]+\)$/, `,${a})`);
  return color;
}

/** Collapse a mode-aware `{ light, dark }` pair to the active side; a plain string passes through unchanged. */
function pickSide(value: ColorValue, isDark: boolean): string {
  return isModeAwareColor(value) ? (isDark ? value.dark : value.light) : value;
}

function makeShadeProxy(shades: ColorShades, isDark: boolean): ColorScale {
  return new Proxy(shades as unknown as ColorScale, {
    get(target, prop) {
      const key = String(prop);
      if (key === 'then') return undefined;
      if (key.includes('/')) {
        const slash = key.indexOf('/');
        const shade = key.slice(0, slash);
        const op = Number(key.slice(slash + 1));
        const color = (target as any)[shade];
        return color !== undefined ? applyOpacity(pickSide(color, isDark), op) : undefined;
      }
      const color = (target as any)[key];
      return color !== undefined ? pickSide(color, isDark) : undefined;
    },
  });
}

// ─── wrapColors ───────────────────────────────────────────────────────────────

export function wrapColors<ColorName extends string = DefaultColorName>(
  rawColors: ThemeColors,
  isDark = false,
): ColorsAPI<ColorName> {
  const cache = new Map<string, ColorScale>();
  const alpha = (color: string, opacity?: number) =>
    opacity === undefined ? color : applyOpacity(color, opacity);

  return new Proxy({ alpha } as unknown as ColorsAPI<ColorName>, {
    get(_, prop) {
      const key = String(prop);
      if (key === 'then') return undefined;
      if (key === 'alpha') return alpha;

      // flat color with opacity: 'white/50'
      if (key.includes('/')) {
        const slash = key.indexOf('/');
        const name = key.slice(0, slash);
        const op = Number(key.slice(slash + 1));
        const entry = rawColors[name];
        return entry !== undefined && (typeof entry === 'string' || isModeAwareColor(entry))
          ? applyOpacity(pickSide(entry, isDark), op)
          : undefined;
      }

      const entry = rawColors[key];
      if (entry === undefined) return undefined;
      if (typeof entry === 'string' || isModeAwareColor(entry)) return pickSide(entry, isDark);

      const cacheKey = `${key}:${isDark}`;
      if (!cache.has(cacheKey)) cache.set(cacheKey, makeShadeProxy(entry, isDark));
      return cache.get(cacheKey)!;
    },
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useColors<ColorName extends string = DefaultColorName>(): ColorsAPI<ColorName> {
  const { config, isDark } = useTheme();
  return useMemo(() => wrapColors<ColorName>(config.theme.colors, isDark), [config.theme.colors, isDark]);
}
