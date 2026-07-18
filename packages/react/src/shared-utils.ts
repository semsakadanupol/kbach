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

/**
 * Chain two event handlers without losing the original — calls `original`
 * with its original arguments, then `extra` with no arguments.
 * Shared by InteractiveWrapper and styled().
 */
export function chain<T extends (...args: any[]) => void>(
  original: T | undefined,
  extra: () => void,
): (...args: Parameters<T>) => void {
  return (...args) => {
    original?.(...args);
    extra();
  };
}

/**
 * Strips internal marker keys (__divideX, __keyframe, etc.) that flatten()
 * leaves in a computed style object — these exist only to carry data through
 * to buildClassCSSRules() on web and must never reach a real style prop.
 * Shared by DarkWrapper, InteractiveWrapper, and jsx-runtime.
 */
export function stripInternalMarkers(s: Record<string, unknown>): void {
  delete s.__divideX; delete s.__divideY; delete s.__divideColor; delete s.__divideStyle;
  delete s.__keyframe;
}

/**
 * Strips web-only grid/position props for React Native components — CSS
 * classes with !important handle these instead on native. Native HTML
 * elements (a bare 'div' etc.) skip this since they support these directly.
 * Shared by DarkWrapper, InteractiveWrapper, and jsx-runtime.
 */
export function stripWebOnlyProps(s: Record<string, unknown>): void {
  if (s.display === 'grid' || s.display === 'inline-grid') delete s.display;
  delete s.gridTemplateColumns; delete s.gridTemplateRows;
  delete s.gridColumn; delete s.gridRow; delete s.gridArea;
  delete s.gridColumnStart; delete s.gridColumnEnd;
  delete s.gridRowStart; delete s.gridRowEnd;
  delete s.gridAutoFlow; delete s.gridAutoColumns; delete s.gridAutoRows;
  delete s.placeItems; delete s.placeContent; delete s.justifyItems;
  delete s.placeSelf; delete s.justifySelf;
  if (s.position === 'sticky' || s.position === 'fixed' || s.position === 'static') {
    delete s.position;
  }
}
