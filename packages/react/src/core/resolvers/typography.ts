import type { StyleValue, ThemeConfig } from '../types';
import { getEffectiveIsWeb, toNativeValue } from '../platform';
import { resolveColor, withOpacityVar } from './color';
import type { Resolver } from './types';

// ─── Font size resolution ─────────────────────────────────────────────────────

function resolveFontSize(
  value: string,
  fontSizes: ThemeConfig['fontSize'],
  isArbitrary: boolean,
): number | string | null {
  if (isArbitrary) return getEffectiveIsWeb() ? value : toNativeValue(value);
  return fontSizes[value] ?? null;
}

// ─── Typography-family resolvers ──────────────────────────────────────────────

export const typographyResolvers: Record<string, Resolver> = {
  // ── Text ───────────────────────────────────────────────────────────────────
  text: ({ value, isArbitrary }, { colors, fontSize }) => {
    // Priority: font size named tokens first, then color
    const size = resolveFontSize(value, fontSize, false);
    if (!isArbitrary && size !== null) return { fontSize: size };

    // Arbitrary: detect by content
    if (isArbitrary) {
      if (/^\d/.test(value) || /^(calc|min|max|clamp)/.test(value)) {
        return { fontSize: getEffectiveIsWeb() ? value : toNativeValue(value) };
      }
      return { color: getEffectiveIsWeb() ? withOpacityVar(value, '--text-opacity') : value };
    }

    const color = resolveColor(value, colors, false);
    if (!color) return null;
    return { color: getEffectiveIsWeb() ? withOpacityVar(color, '--text-opacity') : color };
  },
  'text-opacity': ({ value, isArbitrary }, _) => {
    if (!getEffectiveIsWeb()) return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    const v = isArbitrary ? (n > 1 ? n / 100 : n) : n / 100;
    return { '--text-opacity': v } as StyleValue;
  },

  // ── Text decoration advanced (web-only) ───────────────────────────────────
  decoration: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) {
      if (/^\d/.test(value) || value.startsWith('calc(')) return { textDecorationThickness: value };
      return { textDecorationColor: value };
    }
    const thickTokens: Record<string, string> = {
      auto: 'auto', 'from-font': 'from-font',
      '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px',
    };
    if (value in thickTokens) return { textDecorationThickness: thickTokens[value] };
    const styleTokens: Record<string, string> = {
      solid: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double', wavy: 'wavy',
    };
    if (value in styleTokens) return { textDecorationStyle: styleTokens[value] };
    const color = resolveColor(value, colors, false);
    return color ? { textDecorationColor: color } : null;
  },
  'underline-offset': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { textUnderlineOffset: value };
    const offsets: Record<string, string> = {
      auto: 'auto', '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px',
    };
    return offsets[value] ? { textUnderlineOffset: offsets[value] } : null;
  },

  // ── Content (web-only — for before:/after: pseudo-elements, which don't exist on native) ──
  // Arbitrary value carries its own quotes from the bracket syntax (content-['*'] parses to
  // the literal string 'you can see it' quotes included), so it passes straight through as a
  // valid `content: '*'` CSS value with no extra wrapping needed.
  content: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { content: value };
    const presets: Record<string, string> = { none: 'none' };
    return value in presets ? { content: presets[value] } : null;
  },

  // ── Font ───────────────────────────────────────────────────────────────────
  font: ({ value, isArbitrary }, { fontFamily, fontWeight }) => {
    if (isArbitrary) return { fontFamily: value };
    // Font family
    if (value in fontFamily) {
      const ff = fontFamily[value];
      return { fontFamily: Array.isArray(ff) ? ff.join(', ') : ff };
    }
    // Font weight
    if (value in fontWeight) return { fontWeight: String(fontWeight[value]) };
    return null;
  },

  // ── Line height ────────────────────────────────────────────────────────────
  leading: ({ value, isArbitrary }, { lineHeight }) => {
    if (isArbitrary) return { lineHeight: getEffectiveIsWeb() ? value : toNativeValue(value) };
    const v = lineHeight[value];
    if (v === undefined) return null;
    // String values (e.g. '12px') pass through on web; convert to number for native
    if (typeof v === 'string' && !getEffectiveIsWeb()) return { lineHeight: toNativeValue(v) };
    return { lineHeight: v };
  },

  // ── Letter spacing ─────────────────────────────────────────────────────────
  tracking: ({ value, isArbitrary }, { letterSpacing }) => {
    if (isArbitrary) return { letterSpacing: getEffectiveIsWeb() ? value : toNativeValue(value) };
    const v = letterSpacing[value];
    return v !== undefined ? { letterSpacing: v } : null;
  },

  // ── Line-clamp (web-only) ─────────────────────────────────────────────────
  'line-clamp': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'none') return { overflow: 'visible', display: 'block', WebkitLineClamp: 'unset' } as StyleValue;
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return null;
    return {
      overflow: 'hidden',
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: n,
    } as StyleValue;
  },
};
