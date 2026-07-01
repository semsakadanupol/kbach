/**
 * Shared responsive utilities — imported by styled.tsx, InteractiveWrapper.tsx,
 * and jsx-runtime.tsx so the RESPONSIVE_MODS set and hasResponsiveBuckets helper
 * live in exactly one place (previously duplicated in all three).
 */

import type { ResolvedStyle } from './types';
import { getResponsiveModifiers } from './registry';

/**
 * Returns the set of currently-registered responsive modifier names.
 * This reads from the registry so plugin-registered responsive modifiers
 * are included automatically.
 */
export function getResponsiveMods(): Set<string> {
  return getResponsiveModifiers();
}

/**
 * Returns true when any resolved bucket contains a responsive modifier,
 * meaning the component needs to subscribe to window-width changes.
 */
export function hasResponsiveBuckets(resolved: ResolvedStyle): boolean {
  const responsiveMods = getResponsiveModifiers();
  for (const key of Object.keys(resolved)) {
    if (key === 'base') continue;
    for (const mod of key.split(':')) {
      if (responsiveMods.has(mod)) return true;
    }
  }
  return false;
}

/** Stable empty breakpoints set — used when a component has no responsive classes. */
export const EMPTY_BREAKPOINTS = new Set<string>();
