/** Parses the resolved declaration text's color literal (hex or rgb/rgba) into 0-255 channels + 0-1 alpha. */
export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
// The 4th (alpha) component is matched permissively (`[^)]+`, same as
// the hover provider's own color-detection regex), NOT `[\d.]+` — EVERY
// bg-/text-/border-/etc. color this engine resolves composes opacity via
// a CSS custom property fallback, confirmed live against the real engine:
// `generate_css('bg-blue-6', ...)` produces `rgba(37,99,235,var(--bg-
// opacity, 1))`, not a plain numeric 4th component. A `[\d.]+`
// requirement there doesn't just miss the alpha value — it fails the
// WHOLE regex (the 3 mandatory numbers matched, then neither the
// optional group nor a literal `)` matches `,var(...)`), so this
// silently produced zero color decorations for every named-palette
// color class, which is effectively all of them.
const RGB_RE = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([^)]+))?\)/;

function expandShortHex(hex: string): string {
  if (hex.length === 3 || hex.length === 4) {
    return hex.split('').map((c) => c + c).join('');
  }
  return hex;
}

/** `text` is a resolved CSS declaration's value side (e.g. `background-color: #2563eb` or the raw value alone). */
export function parseColorFromText(text: string): RgbaColor | null {
  const hexMatch = HEX_RE.exec(text);
  if (hexMatch) {
    const hex = expandShortHex(hexMatch[1]!);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const rgbMatch = RGB_RE.exec(text);
  if (rgbMatch) {
    // A non-numeric 4th component (`var(--bg-opacity, 1)`) means the
    // engine's own opacity composition is in its default, unmodified
    // state — 1 is the correct value to show, not just a lazy fallback;
    // an ACTUAL non-default opacity is already baked into a plain number
    // here instead (confirmed via resolvers/color.rs's own
    // apply_opacity_to_hex / the `/N` inline-opacity-suffix path, which
    // writes a literal rgba(...) with a real numeric alpha, never the
    // var() form).
    const alpha = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : NaN;
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: Number.isFinite(alpha) ? alpha : 1,
    };
  }
  return null;
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
}

/** Formats a picked color back into a CSS-literal value usable inside a Kbach arbitrary value (`bg-[...]`). */
export function formatColor({ r, g, b, a }: RgbaColor): string {
  if (a >= 1) return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  const alpha = Math.round(a * 100) / 100;
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}
