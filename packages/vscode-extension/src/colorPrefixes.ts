/**
 * Every Kbach utility prefix whose value is a color — shared by
 * completion (color-shade suggestions) and the color provider (hover
 * swatch + picker rewrite).
 *
 * `divide-color`, NOT bare `divide` — confirmed against the real engine
 * (core-engine/src/resolvers/divide.rs): `divide-x`/`divide-y`/
 * `divide-solid`/etc. are real `divide-*` utilities that have nothing to
 * do with color, while the actual color-bearing one is `divide-color-*`.
 * The bare `divide` entry this list used to have made `base.startsWith`
 * match ALL of those non-color utilities too, AND made the arbitrary-
 * value rewrite the color picker builds (`divide-[#hex]`) resolve to
 * nothing — confirmed live via `generate_css('divide-[#ff0000]', ...)`
 * returning zero rules, vs. `divide-color-[#ff0000]` resolving fine.
 * Every other entry here IS a bare prefix in the real engine (confirmed
 * the same way) — this is the one exception.
 */
export const COLOR_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'from', 'via', 'to', 'decoration', 'caret', 'accent', 'divide-color', 'outline', 'fill', 'stroke',
];
