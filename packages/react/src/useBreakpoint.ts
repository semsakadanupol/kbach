import { useMemo } from 'react';
import { useTheme } from './context';
import { useGlobalWidth } from './useGlobalWidth';
import { getActiveBreakpoints } from './core';

// Shared by both hooks below. Converts the theme's screens map (values may be
// numbers or CSS-length strings like '640px') to a plain numeric map, the
// shape getActiveBreakpoints() (core/responsiveStore.ts) expects.
function toNumericScreens(screens: Record<string, string | number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, v] of Object.entries(screens)) {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isNaN(n)) out[name] = n;
  }
  return out;
}

/**
 * Returns the name of the currently active breakpoint — the largest breakpoint
 * whose min-width the window satisfies, or `'xs'` when below all breakpoints.
 *
 * ```ts
 * const bp = useBreakpoint(); // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
 * ```
 */
export function useBreakpoint(): string {
  const { config } = useTheme();
  const width = useGlobalWidth();
  const screens = config.theme.screens as Record<string, string | number>;
  const numericScreens = useMemo(() => toNumericScreens(screens), [screens]);
  return useMemo(() => {
    // getActiveBreakpoints() takes this hook's own (nearest-<ThemeProvider>)
    // screens map explicitly, rather than defaulting to the global store's —
    // see its comment in core/responsiveStore.ts for why that matters.
    const active = getActiveBreakpoints(width, numericScreens);
    let best: string | null = null;
    let bestMinW = -Infinity;
    for (const name of active) {
      const minW = numericScreens[name]!;
      if (minW > bestMinW) { bestMinW = minW; best = name; }
    }
    return best ?? 'xs';
  }, [numericScreens, width]);
}

/**
 * Returns a record of boolean flags for each breakpoint — `true` when the
 * window width satisfies that breakpoint's min-width threshold.
 *
 * ```ts
 * const { sm, md, lg } = useResponsive();
 * const padding = lg ? 32 : sm ? 16 : 8;
 * ```
 */
export function useResponsive(): Record<string, boolean> {
  const { config } = useTheme();
  const width = useGlobalWidth();
  const screens = config.theme.screens as Record<string, string | number>;
  const numericScreens = useMemo(() => toNumericScreens(screens), [screens]);
  return useMemo(() => {
    const active = getActiveBreakpoints(width, numericScreens);
    const result: Record<string, boolean> = {};
    for (const name of Object.keys(numericScreens)) {
      result[name] = active.has(name);
    }
    return result;
  }, [numericScreens, width]);
}
