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

/**
 * Empty on purpose — augment it via declaration merging so `useColors()` (and
 * `useSpacing()`'s equivalent, `KbachCustomSpacing`) know about a project's
 * `kbach.config.js` colors without repeating a type parameter at every call
 * site. `kbach.config.js` is a plain runtime-loaded .js file, so TypeScript
 * can't see into it on its own — this is the same declaration-merging pattern
 * styled-components' `DefaultTheme` and i18next's resource typing use for the
 * identical problem. Put this in any .d.ts your tsconfig includes:
 *
 * ```ts
 * import '@kbach/ui'; // or '@kbach/native' — either works, native re-exports react's types
 * declare module '@kbach/ui' {
 *   interface KbachCustomColors {
 *     primary: string;    // a flat color, like the built-in `white`/`black`
 *     brand: ColorScale;  // a 1–12 shade scale, like the built-in `blue`/`red`
 *   }
 * }
 * ```
 *
 * A mode-aware `{ light, dark }` config color (see ColorValue) still resolves
 * to a flat `string` at read time — declare those as `string` here too, not
 * as the config shape.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface KbachCustomColors {}

// A named color is either a flat string (transparent, current, black, white, or
// a custom flat color) or a 1–12 shade scale (blue, red, or a custom scale).
// For a name that's part of the DEFAULT theme, this resolves to the PRECISE
// shape (string for flat colors, ColorScale for shade scales), derived from
// defaultColors' own literal type. For a name augmented onto KbachCustomColors
// above, it resolves to exactly the shape declared there. For anything else —
// a one-off custom color added via the ColorName type param instead of the
// augmentation — it falls back to the union, since there's no more specific
// shape information available.
type ColorValueFor<K extends string> = K extends keyof typeof defaultColors
  ? (typeof defaultColors)[K] extends string ? string : ColorScale
  : K extends keyof KbachCustomColors
    ? KbachCustomColors[K]
    : ColorScale | string;

/** Every color name TypeScript knows about without an explicit type parameter: the built-in theme plus whatever's been added via the KbachCustomColors augmentation above. */
type KnownColorName = DefaultColorName | Extract<keyof KbachCustomColors, string>;

/**
 * `ColorName` defaults to `KnownColorName` (the built-in theme's color names
 * plus anything augmented onto `KbachCustomColors` above), so `useColors()`
 * gets full autocomplete and typo-catching out of the box — including custom
 * `kbach.config.js` colors, once augmented once project-wide. Without that
 * augmentation, a project with extra colors can still widen per call instead:
 * `useColors<DefaultColorName | 'brand'>()`.
 */
export type ColorsAPI<ColorName extends string = KnownColorName> =
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

export function wrapColors<ColorName extends string = KnownColorName>(
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

export function useColors<ColorName extends string = KnownColorName>(): ColorsAPI<ColorName> {
  const { config, isDark } = useTheme();
  return useMemo(() => wrapColors<ColorName>(config.theme.colors, isDark), [config.theme.colors, isDark]);
}
