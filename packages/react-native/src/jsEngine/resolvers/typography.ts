/**
 * Port of `resolvers/typography.rs` — the lookup tables native actually
 * consults (`font_weight`, `text_size`, `text_align`, `line_height_size`,
 * `font_family_value`). Everything else in typography.rs (named leading/
 * tracking keywords, letter-spacing scale, text-wrap, decoration/
 * underline-offset/indent/whitespace/break/align/list/hyphens) is
 * web/DOM-only and deliberately excluded — see resolveUtilityNative.ts's
 * doc comment.
 */
import type { ThemeConfig } from '../../theme';
import { arbitraryModifier, type ParsedClass } from '../parser';

export function textSize(key: string): string | null {
  switch (key) {
    case 'xs': return '0.75rem';
    case 'sm': return '0.875rem';
    case 'base': return '1rem';
    case 'lg': return '1.125rem';
    case 'xl': return '1.25rem';
    case '2xl': return '1.5rem';
    case '3xl': return '1.875rem';
    case '4xl': return '2.25rem';
    case '5xl': return '3rem';
    case '6xl': return '3.75rem';
    case '7xl': return '4.5rem';
    case '8xl': return '6rem';
    case '9xl': return '8rem';
    default: return null;
  }
}

export function lineHeightSize(key: string): string | null {
  // Tailwind v4's formula, N * 0.25rem for any non-negative number — not
  // v3's fixed 3-10 table (identical output for 3-10). Mirrors typography.rs.
  if (key === 'px') return '1px';
  if (key.trim() === '') return null;
  const n = Number(key);
  return Number.isFinite(n) && n >= 0 ? `${n * 0.25}rem` : null;
}

/** Named line-height multipliers (typography.rs `leading_named`). */
function leadingNamed(key: string): number | null {
  switch (key) {
    case 'none': return 1;
    case 'tight': return 1.25;
    case 'snug': return 1.375;
    case 'normal': return 1.5;
    case 'relaxed': return 1.625;
    case 'loose': return 2;
    default: return null;
  }
}

/**
 * `text-sm/6`: the size's font-size and the leading part, or null unless
 * the part before the `/` is a real size (so `text-blue-6/50` never comes
 * here). typography.rs `split_size_leading`.
 */
export function splitSizeLeading(value: string): [string, string] | null {
  const i = value.indexOf('/');
  if (i === -1) return null;
  const size = textSize(value.slice(0, i));
  const leading = value.slice(i + 1);
  return size === null || leading === '' ? null : [size, leading];
}

/**
 * The line height for `text-sm/<leading>` on native, where it's absolute:
 * a named or unitless multiplier is multiplied out against the size, and
 * a CSS variable has no meaning. typography.rs `size_leading_native`.
 */
export function sizeLeadingNative(size: string, leading: string): string | null {
  // The size is a named one (rem) or an arbitrary `text-[14px]` (rem or px).
  const rem = (n: number): string | null => {
    const unit = size.endsWith('rem') ? 'rem' : size.endsWith('px') ? 'px' : null;
    if (unit === null) return null;
    const number = size.slice(0, -unit.length);
    const s = Number(number);
    return number.trim() !== '' && Number.isFinite(s) ? `${s * n}${unit}` : null;
  };
  const arbitrary = arbitraryModifier(leading);
  if (arbitrary !== null) {
    if (arbitrary.startsWith('var(')) return null;
    const n = Number(arbitrary);
    return arbitrary.trim() !== '' && Number.isFinite(n) ? rem(n) : arbitrary;
  }
  const scale = lineHeightSize(leading);
  if (scale !== null) return scale;
  const m = leadingNamed(leading);
  return m === null ? null : rem(m);
}

/**
 * An arbitrary `font-[…]`: a weight when the hint says number/integer, or
 * (no hint) the value is a number or a bare CSS variable; else a family.
 * typography.rs `arbitrary_font_is_weight`.
 */
export function arbitraryFontIsWeight(parsed: ParsedClass, value: string): boolean {
  const hint = parsed.typeHint ?? null;
  if (hint !== null) return hint === 'number' || hint === 'integer';
  return (value.trim() !== '' && Number.isFinite(Number(value))) || (value.startsWith('var(') && value.endsWith(')') && !value.includes(','));
}

export function textAlign(key: string): string | null {
  switch (key) {
    case 'left': return 'left';
    case 'center': return 'center';
    case 'right': return 'right';
    case 'justify': return 'justify';
    // Logical alignment — same "no direction-tracking logic needed" reasoning
    // as layout.rs's start/end inset properties.
    case 'start': return 'start';
    case 'end': return 'end';
    default: return null;
  }
}

export function fontWeight(key: string): string | null {
  switch (key) {
    case 'thin': return '100';
    case 'extralight': return '200';
    case 'light': return '300';
    case 'normal': return '400';
    case 'medium': return '500';
    case 'semibold': return '600';
    case 'bold': return '700';
    case 'extrabold': return '800';
    case 'black': return '900';
    default: return null;
  }
}

/**
 * Port of `resolvers/typography.rs`'s `font_family_value` — `theme.fontFamily`
 * always wins when it has an entry for `key` (so a custom theme can both add
 * a new name and override one of the three defaults), falling back to real
 * Tailwind's own default stacks only when the theme doesn't define that name
 * at all.
 */
export function fontFamilyValue(theme: ThemeConfig, key: string): string | null {
  const fromTheme = theme.fontFamily?.[key];
  if (fromTheme !== undefined) return fromTheme;
  switch (key) {
    case 'sans':
      return 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';
    case 'serif':
      return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    default:
      return null;
  }
}
