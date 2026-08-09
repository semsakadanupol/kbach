import type { ColorValue } from './types';

/**
 * True for a mode-aware color pair (`{ light, dark }`), as opposed to a plain
 * hex/rgb/alias string. Shared by config.ts (alias-chain resolution),
 * resolvers/color.ts (direct lookups), and modeAwareColors.ts (className
 * expansion) so all three agree on exactly one definition. Real shade keys
 * are always numeric strings ('1'–'12'), so this can never collide with one.
 */
export function isModeAwareColor(v: unknown): v is { light: string; dark: string } {
  return typeof v === 'object' && v !== null && 'light' in v && 'dark' in v;
}

/**
 * Split a family-shade reference ('warm-gray-6', 'blue-500') on its LAST
 * hyphen so hyphenated custom family names ('warm-gray') keep their shade
 * ('6') separate. Shared by config.ts (alias-chain resolution) and
 * resolvers/color.ts (direct lookups) so both split the same way — each
 * caller still applies its own shade validation afterward (config.ts
 * requires a numeric shade up front; resolvers/color.ts instead checks the
 * shade key exists on the resolved scale), since those run at different
 * points in the pipeline (raw alias source vs. already-built theme).
 */
export function splitColorShadeRef(ref: string): { name: string; shade: string } | null {
  const lastDash = ref.lastIndexOf('-');
  if (lastDash <= 0) return null;
  return { name: ref.slice(0, lastDash), shade: ref.slice(lastDash + 1) };
}

export type { ColorValue };
