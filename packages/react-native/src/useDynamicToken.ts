import { useSyncExternalStore } from 'react';
import { getDynamicToken, subscribeDynamicTokens } from './dynamicTokens';

/**
 * Reads a dynamic token's CURRENT value reactively — the JS-value
 * counterpart to using `var(--name)` directly in a `className` (see
 * `jsxRuntimeCore.ts`'s own `substituteDynamicTokens`/`ReactiveElement` for
 * how that path stays live). Useful when a component needs the raw value
 * itself (e.g. to drive an Animated value, or a calculation), not just a
 * resolved style. Subscribes to the store's shared version counter (same
 * one every token change bumps — see `dynamicTokens.ts`'s own doc comment
 * on why there's no per-token subscription), so this re-renders on ANY
 * token change, then re-reads just the one name it was asked for.
 */
export function useDynamicToken(name: string): string | undefined {
  return useSyncExternalStore(subscribeDynamicTokens, () => getDynamicToken(name));
}
