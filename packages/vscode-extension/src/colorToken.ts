import { COLOR_PREFIXES } from './colorPrefixes';
import { formatColor, type RgbaColor } from './colorValue';
import { splitRespectingBrackets } from './scanTokens';

/**
 * True when `token`'s base is an ARBITRARY bracket color value
 * (`bg-[#ff0000]`, `text-[rgba(0,0,0,.5)]`) rather than a NAMED palette
 * shade (`bg-blue-6`, `border-emerald-8/50`). Used to decide whether the
 * native color-picker decorator should be offered at all for a given
 * token — see `provideDocumentColors`'s own comment in extension.ts for
 * why a named shade deliberately does NOT get one: rewriting a curated,
 * theme-linked palette name into a raw literal hex via an accidental
 * wheel-drag silently throws away the whole point of naming it in the
 * first place, which is the opposite of what picking a shade from the
 * THEME is for. A named shade's color is still visible — via the hover
 * provider's own static swatch, which stays read-only by construction —
 * just not editable through this particular widget. An arbitrary value
 * has no semantic name to lose, so it keeps full picker interactivity.
 */
export function isArbitraryColorToken(token: string): boolean {
  const segments = splitRespectingBrackets(token);
  const base = segments[segments.length - 1]!;
  return COLOR_PREFIXES.some((p) => base.startsWith(`${p}-[`) && base.endsWith(']'));
}

/**
 * Builds the replacement token for when a color is picked from VS Code's
 * native color picker on an arbitrary-value color class — the only kind
 * the color provider ever offers the picker for (`isArbitraryColorToken`
 * above): `bg-[#fff]` + a picked red -> `bg-[#ff0000]`, preserving every
 * modifier prefix (`dark:`, `sm:`, ...) and the original color-utility
 * name (`bg`/`text`/`border`/...) unchanged. Note the replacement's
 * LENGTH can differ from the original's (`#fff` -> `#ff0000`, or any
 * picked alpha < 1 switching to an `rgba(...)` form) — see
 * `provideColorPresentations`' own comment in extension.ts for why that
 * matters. Returns null if `token`'s base doesn't start with one of
 * `COLOR_PREFIXES` — shouldn't happen in practice, since the provider
 * only ever offers this for a token it already resolved to a color, but a
 * safe `null` is better than guessing at an edit that might not make
 * sense.
 */
export function buildColorReplacement(token: string, color: RgbaColor): string | null {
  const segments = splitRespectingBrackets(token);
  const base = segments[segments.length - 1]!;
  const modifiers = segments.slice(0, -1);

  const prefix = COLOR_PREFIXES.find((p) => base.startsWith(`${p}-`));
  if (!prefix) return null;

  const newBase = `${prefix}-[${formatColor(color)}]`;
  return [...modifiers, newBase].join(':');
}
