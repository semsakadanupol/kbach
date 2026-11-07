/**
 * Port of `resolvers/border.rs`'s `resolve` — used wholesale on native
 * (border/rounded resolve to real RN style props; ring/outline resolve to
 * CSS-only properties RN doesn't have, which is harmless — RN just logs an
 * unknown-style-property warning, same precedent the Rust engine documents).
 */
import { colorValue, looksLikeLength } from './color';
import { decl, resolveLength, type Declaration } from '../shared';
import type { ParsedClass } from '../parser';
import type { ThemeConfig } from '../../theme';

function radiusSize(key: string): string | null {
  switch (key) {
    case 'none': return '0px';
    // Tailwind v4.3's radius scale: `sm` is 0.25rem (v3's 0.125rem is `xs`).
    case 'xs': return '0.125rem';
    case 'sm': return '0.25rem';
    case 'md': return '0.375rem';
    case 'lg': return '0.5rem';
    case 'xl': return '0.75rem';
    case '2xl': return '1rem';
    case '3xl': return '1.5rem';
    case '4xl': return '2rem';
    case 'full': return '9999px';
    default: return null;
  }
}

/**
 * A numeric border width: `border-2` / `border-t-4` / `border-x-8` mean
 * exactly N px, NOT a spacing-scale step. Mirrors resolvers/border.rs's
 * `border_width_px` — both engines used to run these through the spacing
 * scale (n * 4px), so `border-2` came out 8px.
 */
function borderWidthPx(parsed: ParsedClass): string | null {
  if (parsed.negative || parsed.isArbitrary || parsed.value === null) return null;
  const n = Number(parsed.value);
  return Number.isFinite(n) && n >= 0 && parsed.value.trim() !== '' ? `${n}px` : null;
}

function borderSideProperty(side: string): string | null {
  switch (side) {
    case 't': return 'border-top';
    case 'r': return 'border-right';
    case 'b': return 'border-bottom';
    case 'l': return 'border-left';
    default: return null;
  }
}

function borderValue(theme: ThemeConfig, parsed: ParsedClass): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;

  if (!parsed.isArbitrary) {
    const side = borderSideProperty(value);
    if (side !== null) {
      return [decl(`${side}-width`, '1px'), decl(`${side}-style`, 'solid')];
    }
    // Bare `border-x` / `border-y`: 1px solid on both sides, like `border-t`.
    const pair = value === 'x' ? ['border-left', 'border-right'] : value === 'y' ? ['border-top', 'border-bottom'] : null;
    if (pair !== null) {
      return [
        decl(`${pair[0]}-width`, '1px'),
        decl(`${pair[1]}-width`, '1px'),
        decl(`${pair[0]}-style`, 'solid'),
        decl(`${pair[1]}-style`, 'solid'),
      ];
    }
    if (value === 'collapse') return [decl('border-collapse', 'collapse')];
    if (value === 'separate') return [decl('border-collapse', 'separate')];
  }
  if (parsed.isArbitrary) {
    // Regression guard: every arbitrary border value used to be treated as
    // border-width unconditionally — "border-[#050505]" (or the same thing
    // via a mode-aware theme color substituted in by
    // substituteModeAwareColorToken, e.g. "border-background") silently
    // produced border-width: #050505, which RN then rejected as an invalid
    // native value. Mirrors resolvers/color.rs's identical fix.
    if (looksLikeLength(value)) return [decl('border-width', value)];
    const color = colorValue(theme, parsed);
    return color === null ? null : [decl('border-color', color)];
  }
  if (Number.isFinite(Number(value)) && value.trim() !== '') {
    const v = borderWidthPx(parsed);
    return v === null ? null : [decl('border-width', v)];
  }
  if (value === 'solid' || value === 'dashed' || value === 'dotted' || value === 'double' || value === 'hidden' || value === 'none') {
    return [decl('border-style', value)];
  }

  const color = colorValue(theme, parsed);
  return color === null ? null : [decl('border-color', color)];
}

/** Per-side width/style/color — used by `border-t`/`border-r`/`border-b`/`border-l` (distinct from the bare literals above). */
function borderSideValue(theme: ThemeConfig, parsed: ParsedClass, sideProperty: string): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) {
    // Same regression guard as `borderValue` above.
    if (looksLikeLength(value)) return [decl(`${sideProperty}-width`, value)];
    const color = colorValue(theme, parsed);
    return color === null ? null : [decl(`${sideProperty}-color`, color)];
  }
  if (Number.isFinite(Number(value)) && value.trim() !== '') {
    const v = borderWidthPx(parsed);
    return v === null ? null : [decl(`${sideProperty}-width`, v)];
  }
  if (value === 'solid' || value === 'dashed' || value === 'dotted' || value === 'double' || value === 'hidden' || value === 'none') {
    return [decl(`${sideProperty}-style`, value)];
  }
  const color = colorValue(theme, parsed);
  return color === null ? null : [decl(`${sideProperty}-color`, color)];
}

/** Same shape as `borderSideValue`, for the two-sides-at-once `border-x`/`border-y` shorthands. */
function borderAxisValue(theme: ThemeConfig, parsed: ParsedClass, sideA: string, sideB: string): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) {
    // Same regression guard as `borderValue` above.
    if (looksLikeLength(value)) return [decl(`${sideA}-width`, value), decl(`${sideB}-width`, value)];
    const color = colorValue(theme, parsed);
    return color === null ? null : [decl(`${sideA}-color`, color), decl(`${sideB}-color`, color)];
  }
  if (Number.isFinite(Number(value)) && value.trim() !== '') {
    const v = borderWidthPx(parsed);
    return v === null ? null : [decl(`${sideA}-width`, v), decl(`${sideB}-width`, v)];
  }
  if (value === 'solid' || value === 'dashed' || value === 'dotted' || value === 'double' || value === 'hidden' || value === 'none') {
    return [decl(`${sideA}-style`, value), decl(`${sideB}-style`, value)];
  }
  const color = colorValue(theme, parsed);
  return color === null ? null : [decl(`${sideA}-color`, color), decl(`${sideB}-color`, color)];
}

/** Per-corner/side border-radius property names. */
function radiusProperties(side: string): string[] | null {
  switch (side) {
    case 't': return ['border-top-left-radius', 'border-top-right-radius'];
    case 'r': return ['border-top-right-radius', 'border-bottom-right-radius'];
    case 'b': return ['border-bottom-right-radius', 'border-bottom-left-radius'];
    case 'l': return ['border-top-left-radius', 'border-bottom-left-radius'];
    case 'tl': return ['border-top-left-radius'];
    case 'tr': return ['border-top-right-radius'];
    case 'br': return ['border-bottom-right-radius'];
    case 'bl': return ['border-bottom-left-radius'];
    default: return null;
  }
}

function resolveRadiusValue(theme: ThemeConfig, parsed: ParsedClass): string | null {
  if (!parsed.isArbitrary && parsed.value !== null) {
    const size = radiusSize(parsed.value);
    if (size !== null) return size;
  }
  return resolveLength(theme, parsed);
}

function resolveRadiusSide(theme: ThemeConfig, parsed: ParsedClass, side: string): Declaration[] | null {
  const properties = radiusProperties(side);
  if (properties === null) return null;
  const value = resolveRadiusValue(theme, parsed);
  if (value === null) return null;
  return properties.map((p) => decl(p, value));
}

const OUTLINE_STYLES = ['solid', 'dashed', 'dotted', 'double'];

/** Any whole number of px (`outline-3`), as in Tailwind v4 — mirrors border.rs's `whole_px`. */
function outlineWidthValue(key: string): string | null {
  return /^\d+$/.test(key) ? `${Number(key)}px` : null;
}

function outlineValue(theme: ThemeConfig, parsed: ParsedClass): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) {
    // Same regression guard as `borderValue` above.
    if (looksLikeLength(value)) return [decl('outline-width', value)];
    const color = colorValue(theme, parsed);
    return color === null ? null : [decl('outline-color', color)];
  }
  const w = outlineWidthValue(value);
  if (w !== null) return [decl('outline-width', w)];
  if (OUTLINE_STYLES.includes(value)) return [decl('outline-style', value)];
  const color = colorValue(theme, parsed);
  return color === null ? null : [decl('outline-color', color)];
}

function outlineOffsetValue(parsed: ParsedClass): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) return [decl('outline-offset', value)];
  const w = outlineWidthValue(value);
  return w === null ? null : [decl('outline-offset', w)];
}

// (No ring helpers: rings are web-only on native, see the 'ring' case below.)

const RADIUS_SIDES = new Set(['t', 'r', 'b', 'l', 'tl', 'tr', 'br', 'bl']);

export function resolve(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  switch (parsed.utility) {
    case 'border':
      if (parsed.value === null) return [decl('border-width', '1px'), decl('border-style', 'solid')];
      return borderValue(theme, parsed);
    case 'border-t':
      return borderSideValue(theme, parsed, 'border-top');
    case 'border-r':
      return borderSideValue(theme, parsed, 'border-right');
    case 'border-b':
      return borderSideValue(theme, parsed, 'border-bottom');
    case 'border-l':
      return borderSideValue(theme, parsed, 'border-left');
    case 'border-x':
      return borderAxisValue(theme, parsed, 'border-left', 'border-right');
    case 'border-y':
      return borderAxisValue(theme, parsed, 'border-top', 'border-bottom');
    case 'rounded': {
      if (parsed.value === null) return [decl('border-radius', '0.25rem')];
      const value = parsed.value;
      if (!parsed.isArbitrary) {
        const size = radiusSize(value);
        if (size !== null) return [decl('border-radius', size)];
      }
      const v = resolveLength(theme, parsed);
      return v === null ? null : [decl('border-radius', v)];
    }
    // Rings are web-only (a var()-composed CSS box-shadow React Native can't
    // parse) — same as resolvers/mod.rs's native dispatcher.
    case 'ring':
    case 'ring-offset':
      return null;
    // Outlines: the same final native style the Rust engine produces once
    // its var()-based web declarations are filtered out (resolve_style.rs):
    // bare `outline` is a 1px width, `outline-none` is outline-style: none,
    // `outline-hidden` keeps only its offset (RN has no `outline` shorthand).
    case 'outline':
      if (parsed.value === null) return [decl('outline-width', '1px')];
      if (parsed.value === 'none') return [decl('outline-style', 'none')];
      if (!parsed.isArbitrary && parsed.value === 'hidden') return [decl('outline-offset', '2px')];
      return outlineValue(theme, parsed);
    case 'outline-offset':
      return outlineOffsetValue(parsed);
    default:
      if (parsed.utility.startsWith('rounded-') && RADIUS_SIDES.has(parsed.utility.slice('rounded-'.length))) {
        return resolveRadiusSide(theme, parsed, parsed.utility.slice('rounded-'.length));
      }
      return null;
  }
}
