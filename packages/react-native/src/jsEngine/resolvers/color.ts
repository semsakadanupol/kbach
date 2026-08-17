/**
 * Port of `resolvers/color.rs`'s `lookup_hex` only — native's own color
 * dispatch (resolveUtilityNative.ts's `resolveColorNative`) doesn't reuse
 * `color::resolve`'s CSS-custom-property opacity composition at all (RN
 * can't parse `var()`), but `border.rs`'s `resolve` (used wholesale on
 * native) needs this same plain-hex lookup for `border-<color>`/
 * `ring-<color>`/`ring-offset-<color>`/`decoration-<color>`.
 */
import type { ThemeConfig } from '../../theme';

export function lookupHex(theme: ThemeConfig, key: string): string | null {
  return theme.colors[key] ?? null;
}
