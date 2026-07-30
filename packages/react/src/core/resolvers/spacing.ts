import type { StyleValue, ThemeConfig } from '../types';
import { getEffectiveIsWeb, toNativeValue } from '../platform';
import type { Resolver } from './types';

// ─── Spacing resolution ───────────────────────────────────────────────────────

export function resolveSpacing(
  value: string,
  negative: boolean,
  spacing: ThemeConfig['spacing'],
  isArbitrary: boolean,
): string | number | null {
  if (isArbitrary) {
    const resolved = getEffectiveIsWeb() ? value : toNativeValue(value);
    if (negative) {
      if (typeof resolved === 'number') return -resolved;
      if (typeof resolved === 'string') {
        if (/^\d/.test(resolved)) return `-${resolved}`;
        if (/^(calc|var|min|max|clamp|env)\s*\(/.test(resolved)) return `calc(-1 * (${resolved}))`;
      }
    }
    return resolved;
  }

  const raw = spacing[value];
  if (raw === undefined) return null;

  if (typeof raw === 'number') return negative ? -raw : raw;
  if (raw === 'auto') return 'auto';
  if (negative && typeof raw === 'string' && raw.endsWith('%')) {
    return `-${raw}`;
  }
  return raw;
}

// ─── Sizing resolution (w, h, min-*, max-*) ──────────────────────────────────

export function resolveSizing(
  value: string,
  spacing: ThemeConfig['spacing'],
  isArbitrary: boolean,
): string | number | null {
  if (isArbitrary) return getEffectiveIsWeb() ? value : toNativeValue(value);

  const raw = spacing[value];
  if (raw !== undefined) return raw;

  // Fractions as percentages: '1/2' → '50%'
  if (/^\d+\/\d+$/.test(value)) {
    const [num, den] = value.split('/').map(Number);
    if (!den) return null; // #3: guard division-by-zero
    return `${((num / den) * 100).toFixed(6)}%`;
  }

  return null;
}

// p/px/py/pt/pr/pb/pl and m/mx/my/mt/mr/mb/ml all resolve a spacing value and
// differ only in the output CSS property name — generate them from one factory.
function makeSpacingResolver(prop: string): Resolver {
  return ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { [prop]: v } : null;
  };
}

const PADDING_MARGIN_PROPS: Record<string, string> = {
  p: 'padding', px: 'paddingHorizontal', py: 'paddingVertical',
  pt: 'paddingTop', pr: 'paddingRight', pb: 'paddingBottom', pl: 'paddingLeft',
  m: 'margin', mx: 'marginHorizontal', my: 'marginVertical',
  mt: 'marginTop', mr: 'marginRight', mb: 'marginBottom', ml: 'marginLeft',
};

// ─── Spacing-family resolvers ─────────────────────────────────────────────────

export const spacingResolvers: Record<string, Resolver> = {
  // ── Sizing ─────────────────────────────────────────────────────────────────
  w: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { width: v } : null;
  },
  h: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { height: v } : null;
  },
  'min-w': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { minWidth: v } : null;
  },
  'min-h': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { minHeight: v } : null;
  },
  'max-w': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { maxWidth: v } : null;
  },
  'max-h': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { maxHeight: v } : null;
  },

  // ── Size shorthand (sets width AND height in one utility) ────────────────
  size: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { width: v, height: v } : null;
  },

  // ── Flex basis ─────────────────────────────────────────────────────────────
  basis: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { flexBasis: v } : null;
  },

  // ── Gap ────────────────────────────────────────────────────────────────────
  gap: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { gap: v } : null;
  },
  'gap-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { columnGap: v } : null;
  },
  'gap-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { rowGap: v } : null;
  },

  // ── Position ───────────────────────────────────────────────────────────────
  top: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { top: v } : null;
  },
  right: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { right: v } : null;
  },
  bottom: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { bottom: v } : null;
  },
  left: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { left: v } : null;
  },
  inset: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { top: v, right: v, bottom: v, left: v } : null;
  },
  'inset-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { left: v, right: v } : null;
  },
  'inset-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { top: v, bottom: v } : null;
  },

  // ── Translate ──────────────────────────────────────────────────────────────
  'translate-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    // resolveSpacing() returns a bare number for anything on the theme spacing
    // scale (translate-x-2 -> 8), meant to be set as a top-level style property —
    // styleValueToCSS() appends "px" to those automatically. Interpolating straight
    // into a transform function string instead skips that step entirely: the raw
    // number renders as unitless CSS ("translateX(8)"), which browsers treat as an
    // invalid value and drop the WHOLE transform declaration, not just this part of
    // it — every translate-x on the numeric spacing scale, positive or negative
    // (anything but 0, which happens to already be valid either way), silently did
    // nothing. Only a string value (a %, an arbitrary "calc(...)", etc.) is already
    // valid CSS text and can be used as-is.
    if (getEffectiveIsWeb()) return { transform: `translateX(${typeof v === 'number' ? `${v}px` : v})` };
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return isNaN(n) ? null : { transform: [{ translateX: n }] };
    }
    return { transform: [{ translateX: v }] };
  },
  'translate-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    // See translate-x above for why the number->px conversion is needed here.
    if (getEffectiveIsWeb()) return { transform: `translateY(${typeof v === 'number' ? `${v}px` : v})` };
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return isNaN(n) ? null : { transform: [{ translateY: n }] };
    }
    return { transform: [{ translateY: v }] };
  },

  // ── Space between ─────────────────────────────────────────────────────────
  // On web: emits __spaceX/__spaceY markers → resolver generates > * + * CSS rules.
  // On native (RN 0.71+): uses columnGap/rowGap directly.
  'space-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    if (getEffectiveIsWeb()) return { __spaceX: v } as StyleValue;
    return { columnGap: v };
  },
  'space-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    if (getEffectiveIsWeb()) return { __spaceY: v } as StyleValue;
    return { rowGap: v };
  },
};

for (const [utility, prop] of Object.entries(PADDING_MARGIN_PROPS)) {
  spacingResolvers[utility] = makeSpacingResolver(prop);
}
