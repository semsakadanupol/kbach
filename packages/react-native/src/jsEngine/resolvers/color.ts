/**
 * Port of `resolvers/color.rs`'s `lookup_hex` only — native's own color
 * dispatch (resolveUtilityNative.ts's `resolveColorNative`) doesn't reuse
 * `color::resolve`'s CSS-custom-property opacity composition at all (RN
 * can't parse `var()`), but `border.rs`'s `resolve` (used wholesale on
 * native) needs this same plain-hex lookup for `border-<color>`/
 * `ring-<color>`/`ring-offset-<color>`/`decoration-<color>`.
 *
 * Mirrors `lookup_hex`'s exact `ColorValue::Plain`-only behavior now that
 * `theme.colors` can also hold `{ light, dark }` entries (for
 * `useColors()` — see `theme.ts`'s own `ColorEntry` doc comment): a
 * mode-aware entry used directly in a utility CLASS name simply doesn't
 * resolve here, same as it wouldn't in the Rust engine either.
 */
import type { ThemeConfig } from '../../theme';

export function lookupHex(theme: ThemeConfig, key: string): string | null {
  const entry = theme.colors[key];
  return typeof entry === 'string' ? entry : null;
}
