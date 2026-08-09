import { useMemo } from 'react';
import { useTheme } from './context';
import type { ThemeSpacing, DefaultSpacingKey } from './core';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Empty on purpose — augment it via declaration merging so `useSpacing()`
 * (like `useColors()`'s `KbachCustomColors`) knows about a project's
 * `kbach.config.js` spacing keys without repeating a type parameter at every
 * call site:
 *
 * ```ts
 * import '@kbach/ui'; // or '@kbach/native'
 * declare module '@kbach/ui' {
 *   interface KbachCustomSpacing {
 *     18: true; // value doesn't matter — only the key is read (see SpacingAPI)
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface KbachCustomSpacing {}

/** Every spacing key TypeScript knows about without an explicit type parameter. */
type KnownSpacingKey = DefaultSpacingKey | Extract<keyof KbachCustomSpacing, string>;

/**
 * `SpacingKey` defaults to `KnownSpacingKey` (the built-in theme's spacing keys
 * plus anything augmented onto `KbachCustomSpacing` above), so `useSpacing()`
 * gets full autocomplete and typo-catching out of the box — including custom
 * `kbach.config.js` keys, once augmented once project-wide. Without that
 * augmentation, a project with extra keys can still widen per call instead:
 * `useSpacing<DefaultSpacingKey | '18'>()`.
 */
export type SpacingAPI<SpacingKey extends string = KnownSpacingKey> = {
  readonly [K in SpacingKey]: number | string;
};

// ─── wrapSpacing ──────────────────────────────────────────────────────────────
//
// Unlike wrapColors() (useColors.ts), this doesn't need a Proxy — there's no
// derived value to compute (no opacity-style suffix syntax, no nested scale
// object per key), so the raw theme.spacing object already has the exact
// runtime shape SpacingAPI describes. The cast exists to apply the KEY
// narrowing described above; it changes nothing at runtime.

export function wrapSpacing<SpacingKey extends string = KnownSpacingKey>(
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
export function useSpacing<SpacingKey extends string = KnownSpacingKey>(): SpacingAPI<SpacingKey> {
  const { config } = useTheme();
  return useMemo(() => wrapSpacing<SpacingKey>(config.theme.spacing), [config.theme.spacing]);
}
