import { useMemo } from 'react';
import { useTheme } from './context';
import { parseHexRgb } from './core';
import type { ThemeColors, ColorShades } from './core';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ColorScale {
  /** `colors.blue[6]` → raw hex string */
  readonly [shade: number]: string;
  /** `colors.blue['6/50']` → shade 6 at 50% opacity */
  readonly [key: string]: string;
}

export interface ColorsAPI {
  /**
   * Pass any CSS color through, optionally applying an opacity (0–100).
   * - `colors.alpha('#3b82f6', 50)` → `'rgba(59,130,246,0.5)'`
   * - `colors.alpha('rgb(0,0,0)', 10)` → `'rgba(0,0,0,0.1)'`
   * - `colors.alpha('rgba(0,0,0,0.5)')` → `'rgba(0,0,0,0.5)'` (passthrough)
   */
  readonly alpha: (color: string, opacity?: number) => string;
  [color: string]: any;
}

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

function makeShadeProxy(shades: ColorShades): ColorScale {
  return new Proxy(shades as unknown as ColorScale, {
    get(target, prop) {
      const key = String(prop);
      if (key === 'then') return undefined;
      if (key.includes('/')) {
        const slash = key.indexOf('/');
        const shade = key.slice(0, slash);
        const op = Number(key.slice(slash + 1));
        const color = (target as any)[shade];
        return typeof color === 'string' ? applyOpacity(color, op) : undefined;
      }
      return (target as any)[key];
    },
  });
}

// ─── wrapColors ───────────────────────────────────────────────────────────────

export function wrapColors(rawColors: ThemeColors): ColorsAPI {
  const cache = new Map<string, ColorScale>();
  const alpha = (color: string, opacity?: number) =>
    opacity === undefined ? color : applyOpacity(color, opacity);

  return new Proxy({ alpha } as unknown as ColorsAPI, {
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
        return typeof entry === 'string' ? applyOpacity(entry, op) : undefined;
      }

      const entry = rawColors[key];
      if (entry === undefined) return undefined;
      if (typeof entry === 'string') return entry;

      if (!cache.has(key)) cache.set(key, makeShadeProxy(entry));
      return cache.get(key)!;
    },
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useColors(): ColorsAPI {
  const { config } = useTheme();
  return useMemo(() => wrapColors(config.theme.colors), [config.theme.colors]);
}
