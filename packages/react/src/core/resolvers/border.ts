import type { StyleValue, ThemeConfig } from '../types';
import { getEffectiveIsWeb, toNativeValue } from '../platform';
import { resolveColor } from './color';
import type { Resolver } from './types';

// ─── Radius resolution ───────────────────────────────────────────────────────

function resolveRadius(
  value: string,
  radii: ThemeConfig['borderRadius'],
  isArbitrary: boolean,
): string | number | null {
  if (isArbitrary) return getEffectiveIsWeb() ? value : toNativeValue(value);
  const key = value === '' ? 'DEFAULT' : value;
  return radii[key] ?? null;
}

// border-t/-r/-b/-l all resolve either an arbitrary/named width or a color for
// one side, differing only in which *Width/*Color property they touch.
function makeBorderSideResolver(widthProp: string, colorProp: string): Resolver {
  return ({ value, isArbitrary }, { colors, borderWidth }) => {
    if (!value) return { [widthProp]: 1 };
    if (isArbitrary) {
      // toNativeValue's numeric check discriminates a dimension from a color,
      // but its px/rem/em conversion is native-only — on web the original
      // string (e.g. "2rem") must be kept so relative units still scale with
      // the root font size, instead of being flattened to a fixed px number.
      const w = toNativeValue(value);
      if (typeof w === 'number') return { [widthProp]: getEffectiveIsWeb() ? value : w };
      return { [colorProp]: value };
    }
    const color = resolveColor(value, colors, false);
    if (color) return { [colorProp]: color };
    const w = borderWidth[value];
    return w !== undefined ? { [widthProp]: w } : null;
  };
}

const BORDER_SIDE_PROPS: Record<string, [string, string]> = {
  'border-t': ['borderTopWidth', 'borderTopColor'],
  'border-r': ['borderRightWidth', 'borderRightColor'],
  'border-b': ['borderBottomWidth', 'borderBottomColor'],
  'border-l': ['borderLeftWidth', 'borderLeftColor'],
};

// ─── Border-family resolvers ───────────────────────────────────────────────────

export const borderResolvers: Record<string, Resolver> = {
  // ── Border width ───────────────────────────────────────────────────────────
  border: ({ value, isArbitrary }, { colors, borderWidth, spacing }) => {
    if (!value) return { borderWidth: borderWidth['DEFAULT'] ?? 1 };

    if (isArbitrary) {
      // toNativeValue returns a number for px/rem/bare-numeric values; strings for colors.
      // Its conversion is native-only, though — on web keep the original string
      // (e.g. "2rem") so relative units still scale instead of becoming a fixed px number.
      const w = toNativeValue(value);
      if (typeof w === 'number') return { borderWidth: getEffectiveIsWeb() ? value : w };
      return { borderColor: value };
    }

    const color = resolveColor(value, colors, false);
    if (color) return { borderColor: color };

    const w = borderWidth[value] ?? spacing[value];
    if (w !== undefined) {
      const numW = typeof w === 'number' ? w : parseFloat(String(w));
      if (isNaN(numW)) return null;
      return { borderWidth: numW };
    }
    return null;
  },

  // border-t/-r/-b/-l generated below via makeBorderSideResolver() — see BORDER_SIDE_PROPS.

  // ── Border radius ──────────────────────────────────────────────────────────
  rounded: ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderRadius: r } : null;
  },
  'rounded-t': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopLeftRadius: r, borderTopRightRadius: r } : null;
  },
  'rounded-r': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopRightRadius: r, borderBottomRightRadius: r } : null;
  },
  'rounded-b': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderBottomLeftRadius: r, borderBottomRightRadius: r } : null;
  },
  'rounded-l': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopLeftRadius: r, borderBottomLeftRadius: r } : null;
  },
  'rounded-tl': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopLeftRadius: r } : null;
  },
  'rounded-tr': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopRightRadius: r } : null;
  },
  'rounded-bl': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderBottomLeftRadius: r } : null;
  },
  'rounded-br': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderBottomRightRadius: r } : null;
  },

  // ── Outline extended (web-only) ───────────────────────────────────────────
  outline: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value) return { outline: '2px solid transparent', outlineOffset: '2px' };
    if (value === 'none') return { outline: 'none', outlineOffset: '0' };
    if (isArbitrary) {
      if (/^\d/.test(value) || value.startsWith('calc(')) return { outlineWidth: value };
      return { outlineColor: value };
    }
    const widths: Record<string, string> = { '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px' };
    if (value in widths) return { outlineWidth: widths[value] };
    const color = resolveColor(value, colors, false);
    return color ? { outlineColor: color } : null;
  },
  'outline-offset': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { outlineOffset: value };
    const offsets: Record<string, string> = { '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px' };
    return offsets[value] ? { outlineOffset: offsets[value] } : null;
  },

  // ── Divide (child combinator CSS, web-only) ───────────────────────────────
  // These return special __divide* markers that resolver.ts converts to
  // .cls > * + * { border-... } CSS rules. No inline style is applied.
  'divide-x': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'reverse') return null;
    if (!value) return { __divideX: 1 } as StyleValue;
    const n = parseFloat(value);
    return isNaN(n) ? null : { __divideX: n } as StyleValue;
  },
  'divide-y': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'reverse') return null;
    if (!value) return { __divideY: 1 } as StyleValue;
    const n = parseFloat(value);
    return isNaN(n) ? null : { __divideY: n } as StyleValue;
  },
  divide: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { __divideColor: value } as StyleValue;
    // Style keywords
    const styleTokens: Record<string, string> = {
      solid: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double', none: 'none',
    };
    if (value in styleTokens) return { __divideStyle: styleTokens[value] } as StyleValue;
    // Color
    const color = resolveColor(value, colors, false);
    return color ? { __divideColor: color } as StyleValue : null;
  },

  // ── Ring ───────────────────────────────────────────────────────────────────
  // Web: box-shadow outline ring (doesn't affect layout).
  // Native: React Native has no box-shadow, so this falls back to borderWidth/
  // borderColor — the closest visual approximation (used by other RN Tailwind-
  // likes for the same reason). Unlike the web ring, this DOES affect layout,
  // and it shares its properties with the `border` utility — combining
  // `border-*` and `ring-*` on the same native element means whichever class
  // comes later wins, since both ultimately set borderWidth/borderColor.
  ring: ({ value, isArbitrary }, { colors }) => {
    const onWeb = getEffectiveIsWeb();
    const DEFAULT_COLOR = 'rgba(59, 130, 246, 0.5)';
    const DEFAULT_WIDTH = 3;

    const asNative = (w: number, color: string): StyleValue =>
      w === 0 ? { borderWidth: 0 } : { borderWidth: w, borderColor: color };

    if (!value) {
      return onWeb
        ? { boxShadow: `0 0 0 ${DEFAULT_WIDTH}px ${DEFAULT_COLOR}` } as StyleValue
        : asNative(DEFAULT_WIDTH, DEFAULT_COLOR);
    }

    if (value === 'inset') {
      // No inset/outset distinction for a native border — same visual result either way.
      return onWeb
        ? { boxShadow: `inset 0 0 0 ${DEFAULT_WIDTH}px ${DEFAULT_COLOR}` } as StyleValue
        : asNative(DEFAULT_WIDTH, DEFAULT_COLOR);
    }

    const widthTokens: Record<string, number> = { '0': 0, '1': 1, '2': 2, '4': 4, '8': 8 };
    if (!isArbitrary && value in widthTokens) {
      const w = widthTokens[value]!;
      return onWeb
        ? { boxShadow: w === 0 ? 'none' : `0 0 0 ${w}px ${DEFAULT_COLOR}` } as StyleValue
        : asNative(w, DEFAULT_COLOR);
    }

    if (isArbitrary) {
      const numMatch = /^(\d+(?:\.\d+)?)(px|rem|em|vw|vh)?$/.exec(value);
      if (numMatch) {
        const unit = numMatch[2] ?? 'px';
        if (onWeb) return { boxShadow: `0 0 0 ${numMatch[1]}${unit} ${DEFAULT_COLOR}` } as StyleValue;
        // borderWidth is a raw number on native — only the (near-universal) px case translates.
        return unit === 'px' ? asNative(parseFloat(numMatch[1]!), DEFAULT_COLOR) : null;
      }
      // Full arbitrary box-shadow string (e.g. ring-[0_0_0_2px_red]) — web-only,
      // no native translation exists for an arbitrary box-shadow value.
      return onWeb ? { boxShadow: value.replace(/_/g, ' ') } as StyleValue : null;
    }

    const color = resolveColor(value, colors, false);
    if (color) {
      return onWeb
        ? { boxShadow: `0 0 0 ${DEFAULT_WIDTH}px ${color}` } as StyleValue
        : asNative(DEFAULT_WIDTH, color);
    }

    return null;
  },

  // Web-only, unlike `ring` above: this stacks a second box-shadow layer to
  // create a gap between the element and the ring. There's no native
  // equivalent to approximate that with (a border can't create a gap outside
  // its own element without an extra wrapper view), so this stays a no-op
  // on native rather than rendering a misleading half-translation.
  'ring-offset': ({ value, isArbitrary }, _theme) => {
    if (!getEffectiveIsWeb()) return null;
    const DEFAULT_RING_COLOR = 'rgba(59, 130, 246, 0.5)';
    const DEFAULT_RING_WIDTH = 3;

    const offsetTokens: Record<string, number> = { '0': 0, '1': 1, '2': 2, '4': 4, '8': 8 };
    // Arbitrary values keep whatever unit the caller supplied (e.g. "0.5rem")
    // instead of assuming px — a bare numeric string still resolves to a number.
    let offsetWidth: string | number | null;
    if (!isArbitrary) {
      offsetWidth = value in offsetTokens ? offsetTokens[value]! : null;
    } else {
      offsetWidth = /^-?\d+(\.\d+)?$/.test(value) ? parseFloat(value) : value;
    }

    if (offsetWidth === null || (typeof offsetWidth === 'number' && isNaN(offsetWidth))) return null;

    const isZero = offsetWidth === 0 || offsetWidth === '0';
    const offsetCss = typeof offsetWidth === 'number' ? `${offsetWidth}px` : offsetWidth;

    return {
      boxShadow: isZero
        ? `0 0 0 ${DEFAULT_RING_WIDTH}px ${DEFAULT_RING_COLOR}`
        : `0 0 0 ${offsetCss} #fff, 0 0 0 calc(${offsetCss} + ${DEFAULT_RING_WIDTH}px) ${DEFAULT_RING_COLOR}`,
    } as StyleValue;
  },
};

for (const [utility, [widthProp, colorProp]] of Object.entries(BORDER_SIDE_PROPS)) {
  borderResolvers[utility] = makeBorderSideResolver(widthProp, colorProp);
}
