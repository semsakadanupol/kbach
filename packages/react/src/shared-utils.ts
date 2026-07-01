import type { ResolvedStyle } from './core/types';
import { getResponsiveModifiers, getInteractiveModifiers } from './core/registry';

/**
 * Returns true if any bucket in a ResolvedStyle map requires responsive
 * breakpoint tracking (sm:, md:, lg:, xl:, 2xl:, or any plugin-registered
 * responsive modifier).
 *
 * Derives the responsive modifier set from the registry so custom responsive
 * modifiers added via plugins are automatically included.
 *
 * Shared by DarkWrapper, InteractiveWrapper, and styled() — single definition.
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

/** Returns true if any bucket in a ResolvedStyle requires JS interaction tracking (hover, focus, press, etc.). */
export function hasInteractiveBuckets(resolved: ResolvedStyle): boolean {
  const interactiveMods = getInteractiveModifiers();
  for (const key of Object.keys(resolved)) {
    if (key === 'base') continue;
    for (const mod of key.split(':')) {
      if (interactiveMods.has(mod)) return true;
    }
  }
  return false;
}

/** Frozen empty Set reused wherever no breakpoints are active. */
export const EMPTY_BREAKPOINTS: ReadonlySet<string> = new Set<string>();
