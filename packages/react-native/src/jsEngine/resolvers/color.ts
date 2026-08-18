/**
 * Port of `resolvers/color.rs`'s `lookup_hex`/`color_value`/`split_opacity`
 * — native's own color dispatch (resolveUtilityNative.ts's
 * `resolveColorNative`) doesn't reuse `color::resolve`'s CSS-custom-property
 * opacity composition at all (RN can't parse `var()`), but `border.rs`'s
 * `resolve` (used wholesale on native) needs this same plain-hex lookup for
 * `border-<color>`/`ring-<color>`/`ring-offset-<color>`/`decoration-<color>`
 * — those still call `lookupHex` directly, unaffected by the opacity
 * addition below.
 *
 * Mirrors `lookup_hex`'s exact `ColorValue::Plain`-only behavior now that
 * `theme.colors` can also hold `{ light, dark }` entries (for
 * `useColors()` — see `theme.ts`'s own `ColorEntry` doc comment): a
 * mode-aware entry used directly in a utility CLASS name simply doesn't
 * resolve here, same as it wouldn't in the Rust engine either.
 */
import type { ThemeConfig } from '../../theme';
import type { ParsedClass } from '../parser';

export function lookupHex(theme: ThemeConfig, key: string): string | null {
  const entry = theme.colors[key];
  return typeof entry === 'string' ? entry : null;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Splits a trailing `/N` opacity suffix off a color value — Tailwind's
 * inline opacity modifier (`bg-orange-5/50`), a completely different
 * mechanism from the `bg-opacity-*` companion-class utility (which
 * doesn't resolve on native at all — see resolveUtilityNative.ts). Only
 * ever splits when the tail after the LAST "/" parses as a plain 0-100
 * integer — this engine's spacing/sizing utilities also use "/" for
 * FRACTIONS (`w-1/2`), a completely different meaning, but no real color
 * name is ever literally digits, so there's no actual ambiguity between
 * the two uses in practice. Mirrors `resolvers/color.rs`'s `split_opacity`.
 */
function splitOpacity(value: string): [string, number | null] {
  const slash = value.lastIndexOf('/');
  if (slash === -1) return [value, null];
  const opacityText = value.slice(slash + 1);
  const n = Number(opacityText);
  if (opacityText !== '' && Number.isInteger(n) && n >= 0 && n <= 100) {
    return [value.slice(0, slash), n];
  }
  return [value, null];
}

/**
 * Looks up a named color, baking in an inline `/N` opacity suffix (if
 * present) as an `rgba(...)` string — arbitrary values are used as-is.
 * `nativeHexColor` (resolveUtilityNative.ts) uses this for `bg`/`text`, the
 * only representation native's style system can use at all for a
 * slash-opacity color, since it can't parse a CSS `var()`. Mirrors
 * `resolvers/color.rs`'s `color_value` exactly.
 */
export function colorValue(theme: ThemeConfig, parsed: ParsedClass): string | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) return value;
  const [name, opacity] = splitOpacity(value);
  const hex = lookupHex(theme, name);
  if (hex === null) return null;
  if (opacity === null) return hex;
  const rgb = hexToRgb(hex);
  if (rgb === null) return hex;
  return `rgba(${rgb.join(',')},${opacity / 100})`;
}
