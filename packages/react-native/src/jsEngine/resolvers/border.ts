/**
 * Port of `resolvers/border.rs`'s `resolve` — used wholesale on native
 * (border/rounded resolve to real RN style props; ring/outline resolve to
 * CSS-only properties RN doesn't have, which is harmless — RN just logs an
 * unknown-style-property warning, same precedent the Rust engine documents).
 */
import { colorValue } from './color';
import { decl, resolveLength, type Declaration } from '../shared';
import type { ParsedClass } from '../parser';
import type { ThemeConfig } from '../../theme';

function radiusSize(key: string): string | null {
  switch (key) {
    case 'none': return '0px';
    case 'sm': return '0.125rem';
    case 'md': return '0.375rem';
    case 'lg': return '0.5rem';
    case 'xl': return '0.75rem';
    case '2xl': return '1rem';
    case '3xl': return '1.5rem';
    case 'full': return '9999px';
    default: return null;
  }
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
    if (value === 'collapse') return [decl('border-collapse', 'collapse')];
    if (value === 'separate') return [decl('border-collapse', 'separate')];
  }
  if (parsed.isArbitrary) {
    return [decl('border-width', value)];
  }
  if (Number.isFinite(Number(value)) && value.trim() !== '') {
    const v = resolveLength(theme, parsed);
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
  if (parsed.isArbitrary) return [decl(`${sideProperty}-width`, value)];
  if (Number.isFinite(Number(value)) && value.trim() !== '') {
    const v = resolveLength(theme, parsed);
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
  if (parsed.isArbitrary) return [decl(`${sideA}-width`, value), decl(`${sideB}-width`, value)];
  if (Number.isFinite(Number(value)) && value.trim() !== '') {
    const v = resolveLength(theme, parsed);
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

function outlineWidthValue(key: string): string | null {
  switch (key) {
    case '0': return '0px';
    case '1': return '1px';
    case '2': return '2px';
    case '4': return '4px';
    case '8': return '8px';
    default: return null;
  }
}

function outlineValue(theme: ThemeConfig, parsed: ParsedClass): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) return [decl('outline-width', value)];
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

const RING_BOX_SHADOW =
  'var(--kb-ring-inset,) 0 0 0 var(--kb-ring-offset-width, 0px) var(--kb-ring-offset-color, #fff), var(--kb-ring-inset,) 0 0 0 calc(var(--kb-ring-width, 0px) + var(--kb-ring-offset-width, 0px)) var(--kb-ring-color, rgba(59,130,246,0.5))';

function ringWidth(key: string): string | null {
  switch (key) {
    case '0': return '0px';
    case '1': return '1px';
    case '2': return '2px';
    case '4': return '4px';
    case '8': return '8px';
    default: return null;
  }
}

function ringValue(theme: ThemeConfig, parsed: ParsedClass): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (value === 'inset') {
    return [decl('--kb-ring-inset', 'inset'), decl('box-shadow', RING_BOX_SHADOW)];
  }
  if (!parsed.isArbitrary) {
    const w = ringWidth(value);
    if (w !== null) return [decl('--kb-ring-width', w), decl('box-shadow', RING_BOX_SHADOW)];
  }
  const color = colorValue(theme, parsed);
  if (color === null) return null;
  return [decl('--kb-ring-color', color), decl('box-shadow', RING_BOX_SHADOW)];
}

function ringOffsetValue(theme: ThemeConfig, parsed: ParsedClass): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (!parsed.isArbitrary) {
    const w = ringWidth(value);
    if (w !== null) return [decl('--kb-ring-offset-width', w), decl('box-shadow', RING_BOX_SHADOW)];
  }
  const color = colorValue(theme, parsed);
  if (color === null) return null;
  return [decl('--kb-ring-offset-color', color), decl('box-shadow', RING_BOX_SHADOW)];
}

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
    case 'ring':
      if (parsed.value === null) return [decl('--kb-ring-width', '3px'), decl('box-shadow', RING_BOX_SHADOW)];
      return ringValue(theme, parsed);
    case 'ring-offset':
      return ringOffsetValue(theme, parsed);
    case 'outline':
      if (parsed.value === null) return [decl('outline-style', 'solid')];
      if (parsed.value === 'none') return [decl('outline', 'none')];
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
