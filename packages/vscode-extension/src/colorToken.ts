import { COLOR_PREFIXES } from './colorPrefixes';
import { formatColor, type RgbaColor } from './colorValue';

/** Splits on ':' outside `[...]` brackets — same rule every real splitter in this codebase uses (see generate-vocabulary.mjs's own copy of this). */
function splitRespectingBrackets(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of token) {
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

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
 * native color picker on an EXISTING named color class (`bg-blue-6`) —
 * there's no 1:1 "literal value" to overwrite in place, since the class
 * names a palette entry, not a color itself, so this instead rewrites it
 * to the equivalent arbitrary-value class for the picked color
 * (`bg-[#ff0000]`), preserving every modifier prefix (`dark:`, `sm:`, ...)
 * and the original color-utility name (`bg`/`text`/`border`/...)
 * unchanged. Returns null if `token`'s base doesn't start with one of
 * `COLOR_PREFIXES` — shouldn't happen in practice, since the color
 * provider only ever offers this for a token it already resolved to a
 * color value in the first place, but a safe `null` is better than
 * guessing at an edit that might not make sense.
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
