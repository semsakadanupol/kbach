// See ThemeProvider.tsx's own doc comment on this directive — this file
// calls useTheme() internally, so it's a hook too.
'use client';

import { useMemo } from 'react';
import { getTheme } from './theme';
import type { ColorEntry, ThemeConfig } from './theme';
import { useTheme } from './useTheme';
import { ensureColorVariablesInjected, parseHexRgb } from './colorVariables';

export interface ColorScale {
  /** `colors.blue[6]` -> raw value */
  readonly [shade: number]: string;
  /** `colors.blue['6/50']` -> shade 6 at 50% opacity */
  readonly [key: string]: string;
}

// A type intersection, not a single interface with both an index signature
// AND an explicit `alpha` member — TypeScript requires every declared
// member of an interface to be assignable to that interface's OWN index
// signature, which `alpha`'s function type isn't (it's not a `string |
// ColorScale`); intersecting two independent shapes sidesteps that
// entirely, the same way old-kbach's own `ColorsAPI` type did.
export type ColorsAPI = {
  /** `colors.white`, `colors.blue` (a shade family), `colors.surface`, ... */
  readonly [name: string]: string | ColorScale;
} & {
  /**
   * Applies an opacity (0–100) to any color string this hook can return —
   * a hex, `rgb()`/`rgba()`, or one of this hook's own
   * `rgb(var(--kb-color-x))` mode-aware references.
   */
  readonly alpha: (color: string, opacity?: number) => string;
  /**
   * Same lookup dot/bracket access does (`colors.get('brand')` ===
   * `colors.brand`), typed as plain `string` instead of `string |
   * ColorScale` — use this whenever the result goes somewhere that expects
   * a real `string` and hits a type error otherwise. The wider union on
   * every OTHER property here isn't a bug: a flat custom color (`surface`)
   * and a shade-family prefix (`blue`) are served by the exact same
   * object, and TypeScript has no way to statically know which one any
   * given key names — `kbach.config.js`'s colors are plain runtime JS, not
   * a type declaration this package could inspect ahead of time. A name
   * with no matching theme entry falls back to the name itself,
   * unresolved — the same "not a known color name -> literal value"
   * convention `kbach.config.js`'s own color aliasing already uses (see
   * `config.ts`'s `resolveColorEntry`), never an error.
   */
  readonly get: (name: string) => string;
};

function applyOpacity(color: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100));
  const varMatch = /^rgb\(var\((--[\w-]+)\)\)$/.exec(color);
  if (varMatch) return `rgba(var(${varMatch[1]}), ${a})`;
  if (color.startsWith('#')) {
    const rgb = parseHexRgb(color);
    return rgb ? `rgba(${rgb.join(',')},${a})` : color;
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  if (color.startsWith('rgba(')) return color.replace(/,\s*[\d.]+\)$/, `,${a})`);
  return color;
}

/**
 * Resolves ONE color entry to a usable CSS value — the "smarter than
 * old-kbach" part. Old-kbach's `useColors()` always collapsed a mode-aware
 * `{ light, dark }` pair to a fixed hex string at hook-call time, which
 * meant a dark-mode toggle only showed up wherever `isDark` had already
 * re-rendered the component. A PLAIN color never had that problem — it's
 * the same value regardless of theme — so this only changes behavior for
 * mode-aware entries: on web, where CSS exists and `ensureColorVariablesInjected`
 * has a `:root`/dark-selector rule pair defined for it, this hands back a
 * live `rgb(var(--kb-color-name))` reference instead — the browser's own
 * cascade keeps it correct across light/dark, no re-render involved at
 * all. Falls back to the old isDark-collapse behavior only when the color
 * isn't representable as a CSS variable (non-hex mode-aware value — rare).
 */
function resolveEntry(name: string, entry: ColorEntry, isDark: boolean): string {
  if (typeof entry === 'string') return entry;
  const light = parseHexRgb(entry.light);
  const dark = parseHexRgb(entry.dark);
  if (light && dark) return `rgb(var(--kb-color-${name}))`;
  return isDark ? entry.dark : entry.light;
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
    const value = resolveEntry(name, entry, isDark);
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
      // A flat name ("white", "surface") or flat-with-opacity
      // ("surface/50") resolves directly; anything else is treated as a
      // shade-family name ("blue") and gets its own nested proxy.
      const direct = resolveNamed(key);
      if (direct !== undefined) return direct;
      if (!cache.has(key)) cache.set(key, makeFamilyProxy(key));
      return cache.get(key)!;
    },
  });
}

/**
 * Resolved theme colors as real values — for anywhere you need an actual
 * color (an SVG `fill`, a canvas context, a chart library prop), not a
 * `className`. Ported from old-kbach's `useColors()`
 * (`old-kbach/packages/ui/src/useColors.ts`), adapted to this engine's flat
 * `"blue-6"`-keyed palette (`colors.blue[6]` looks up `"blue-6"`).
 *
 * Any color — a shade-family entry like `"blue-6"` or a standalone name
 * like `"surface"` — can be defined in the theme as either a plain string
 * (static, same in both modes) or a `{ light, dark }` pair — fully manual,
 * no automatic shade-shifting or other assumption about what a "dark
 * variant" should be; see `resolveEntry`'s own doc comment for how a
 * `{ light, dark }` entry resolves.
 *
 * ```ts
 * const colors = useColors();
 * colors.blue[6];         // "#3b82f6" — static, same value in both modes
 * colors.blue['6/50'];    // same, at 50% opacity
 * colors.surface;         // "rgb(var(--kb-color-surface))" if defined as { light, dark }
 * colors.alpha(colors.surface, 50); // "rgba(var(--kb-color-surface), 0.5)"
 * colors.get('surface');  // same value as colors.surface, typed as plain `string`
 * ```
 */
export function useColors(): ColorsAPI {
  const { isDark } = useTheme();
  const theme = getTheme();
  ensureColorVariablesInjected(theme);
  // Memoized on (theme, isDark) — without this, every render (including
  // ones unrelated to color/theme, e.g. a parent re-rendering for its own
  // reasons) allocated a fresh Proxy + Map here for no reason, since the
  // resolved colors are a pure function of these two inputs.
  return useMemo(() => makeColorsProxy(theme, isDark), [theme, isDark]);
}
