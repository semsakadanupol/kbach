import { useMemo } from 'react';
import { useTheme } from './context';
import type { ThemeSpacing, DefaultSpacingKey } from './core';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * `SpacingKey` defaults to the built-in theme's spacing keys (`DefaultSpacingKey`,
 * derived from `defaultTheme.spacing` in core/theme.ts), so `useSpacing()` gets
 * full autocomplete and typo-catching out of the box for any project on the
 * default scale. A customized `kbach.config.js` isn't visible to TypeScript
 * (it's a plain .js file loaded at runtime, not a statically-analyzed module),
 * so a project with extra spacing keys needs to widen the type parameter
 * explicitly: `useSpacing<DefaultSpacingKey | '18'>()`.
 */
export type SpacingAPI<SpacingKey extends string = DefaultSpacingKey> = {
  readonly [K in SpacingKey]: number | string;
};

// ─── wrapSpacing ──────────────────────────────────────────────────────────────
//
// Unlike wrapColors() (useColors.ts), this doesn't need a Proxy — there's no
// derived value to compute (no opacity-style suffix syntax, no nested scale
// object per key), so the raw theme.spacing object already has the exact
// runtime shape SpacingAPI describes. The cast exists to apply the KEY
// narrowing described above; it changes nothing at runtime.

export function wrapSpacing<SpacingKey extends string = DefaultSpacingKey>(
  rawSpacing: ThemeSpacing,
): SpacingAPI<SpacingKey> {
  return rawSpacing as SpacingAPI<SpacingKey>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the active theme's spacing scale as a typed, autocomplete-friendly
 * object — useful anywhere a raw JS number/string is needed instead of a
 * className (Animated API distances, chart dimensions, FlatList separator
 * heights, etc.). Values match exactly what `p-`/`m-`/`w-`/`h-`/`gap-` and
 * other spacing-scale utilities resolve to.
 *
 * ```ts
 * const spacing = useSpacing();
 * spacing[4]      // 16
 * spacing.full    // '100%'
 * spacing['1/2']  // '50%'
 * ```
 */
export function useSpacing<SpacingKey extends string = DefaultSpacingKey>(): SpacingAPI<SpacingKey> {
  const { config } = useTheme();
  return useMemo(() => wrapSpacing<SpacingKey>(config.theme.spacing), [config.theme.spacing]);
}
