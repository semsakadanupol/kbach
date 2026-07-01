import { useMemo } from 'react';
import { useTheme } from './context';
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
    const h = color.slice(1);
    let rs: string, gs: string, bs: string;
    if (h.length === 3 || h.length === 4) {
      rs = h[0] + h[0]; gs = h[1] + h[1]; bs = h[2] + h[2];
    } else if (h.length === 8) {
      // #rrggbbaa — ignore embedded alpha, caller's opacity wins
      rs = h.slice(0, 2); gs = h.slice(2, 4); bs = h.slice(4, 6);
    } else {
      rs = h.slice(0, 2); gs = h.slice(2, 4); bs = h.slice(4, 6);
    }
    return `rgba(${parseInt(rs, 16)},${parseInt(gs, 16)},${parseInt(bs, 16)},${a})`;
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
