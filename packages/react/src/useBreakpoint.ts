import { useMemo } from 'react';
import { useTheme } from './context';
import { useGlobalWidth } from './useGlobalWidth';

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
  // Sort once per config change, not every render.
  const sorted = useMemo(
    () =>
      (Object.entries(screens) as [string, string | number][])
        .map(([name, v]): [string, number] => [name, typeof v === 'number' ? v : parseInt(String(v), 10)])
        .filter(([, minW]) => !Number.isNaN(minW))
        .sort(([, a], [, b]) => b - a),
    [screens],
  );
  for (const [name, minW] of sorted) {
    if (width >= minW) return name;
  }
  return 'xs';
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
  return useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const [name, v] of Object.entries(screens)) {
      const minW = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (!Number.isNaN(minW)) result[name] = width >= minW;
    }
    return result;
  }, [screens, width]);
}
