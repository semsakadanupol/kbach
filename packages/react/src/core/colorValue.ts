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

export type { ColorValue };
