import type { StyleValue, ThemeColors } from '../types';
import { getEffectiveIsWeb } from '../platform';
import type { Resolver } from './types';

// ─── Color resolution ─────────────────────────────────────────────────────────

export function resolveColor(value: string, colors: ThemeColors, isArbitrary: boolean): string | null {
  if (isArbitrary) return value;

  // Slash opacity: 'blue-500/50', 'black/80', 'white/[0.3]'
  const slashIdx = value.indexOf('/');
  const colorPart = slashIdx > 0 ? value.slice(0, slashIdx) : value;
  const opacityPart = slashIdx > 0 ? value.slice(slashIdx + 1) : null;

  // Resolve base hex
  let hex: string | null = null;
  if (colorPart in colors) {
    const entry = colors[colorPart];
    if (typeof entry === 'string') hex = entry;
    else if (typeof entry === 'object' && '6' in entry) hex = entry['6']!;
  } else {
    const lastDash = colorPart.lastIndexOf('-');
    if (lastDash > 0) {
      const colorName = colorPart.slice(0, lastDash);
      const shade = colorPart.slice(lastDash + 1);
      const scale = colors[colorName];
      if (scale && typeof scale === 'object' && shade in scale) {
        hex = (scale as Record<string, string>)[shade] ?? null;
      }
    }
  }

  // Palette aliases (e.g. a theme color set to "orange-6") are already fully
  // dereferenced by config.ts's resolveColorRefs() when buildConfig() produces
  // the theme this function is always called with — so `hex`, once found in
  // `colors` above, is already a real hex/rgb value or a special keyword
  // ('transparent', 'currentColor'), never an unresolved alias. (Previously
  // this function re-dereferenced one hop of alias here too, duplicating
  // resolveColorRefs()'s job in a way that could silently drift from it —
  // removed rather than kept as a second implementation of the same behavior.)

  if (!hex) return null;
  if (!opacityPart) {
    // React Native doesn't support 8-char hex (#RRGGBBAA) — convert to rgba() to preserve embedded alpha.
    if (!getEffectiveIsWeb() && hex.startsWith('#') && hex.length === 9) {
      return hexToRgba(hex, Math.round(parseInt(hex.slice(7, 9), 16) / 255 * 1000) / 1000);
    }
    return hex;
  }

  // Parse opacity: '50' → 0.5, '[0.3]' → 0.3
  let alpha: number;
  if (opacityPart.startsWith('[') && opacityPart.endsWith(']')) {
    const v = parseFloat(opacityPart.slice(1, -1));
    alpha = v > 1 ? v / 100 : v;
  } else {
    alpha = parseFloat(opacityPart) / 100;
  }
  if (isNaN(alpha)) return hex;
  // Clamp out-of-range input (e.g. "bg-blue-6/150", "bg-blue-6/-20") instead of
  // handing an invalid alpha straight to rgba() — CSS itself would clamp it
  // silently, but doing it here keeps the resolved value well-formed everywhere
  // this StyleValue is read (e.g. React Native's style validation, useColors()).
  if (alpha < 0) alpha = 0;
  else if (alpha > 1) alpha = 1;

  return hexToRgba(hex, alpha);
}

/**
 * Parse a hex color string (#rgb, #rgba, #rrggbb, #rrggbbaa) into an [r, g, b]
 * tuple. Any alpha nibble/byte is ignored — callers apply their own opacity.
 * Shared with useColors.ts's applyOpacity() so hex parsing lives in one place.
 */
export function parseHexRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '');
  if (h.length === 3 || h.length === 4) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ];
  }
  if (h.length === 6 || h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Web only. Wrap a flat hex color in `rgba(r,g,b,var(--name,1))` so a sibling
 * `bg-opacity-{n}`/`text-opacity-{n}` class — which independently sets --name
 * as a bare CSS custom property — can control this declaration's alpha via
 * the CSS cascade. Each class token resolves independently with no awareness
 * of what else is on the same element, so a shared CSS variable read at the
 * point of use is the only way for one class to affect another's output.
 *
 * Only flat hex colors are wrapped. Colors that already carry their own alpha
 * (the `bg-blue-6/50` slash syntax, which calls hexToRgba above) and anything
 * that isn't hex (`transparent`, `currentColor`, an arbitrary `hsl(...)`/named
 * CSS color) pass through unchanged — there's no clean way to compose a var()
 * alpha into an already-resolved rgba() or a keyword, and the slash syntax is
 * the direct, explicit way to set opacity for a single class anyway.
 */
export function withOpacityVar(color: string, varName: string): string {
  if (!color.startsWith('#')) return color;
  const rgb = parseHexRgb(color);
  if (!rgb) return color;
  const [r, g, b] = rgb;
  return `rgba(${r},${g},${b},var(${varName},1))`;
}

// ─── Color-family resolvers ───────────────────────────────────────────────────

export const colorResolvers: Record<string, Resolver> = {
  // ── Background ─────────────────────────────────────────────────────────────
  bg: ({ value, isArbitrary }, { colors }) => {
    const color = resolveColor(value, colors, isArbitrary);
    if (!color) return null;
    return { backgroundColor: getEffectiveIsWeb() ? withOpacityVar(color, '--bg-opacity') : color };
  },
  'bg-opacity': ({ value, isArbitrary }, _) => {
    if (!getEffectiveIsWeb()) return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    const v = isArbitrary ? (n > 1 ? n / 100 : n) : n / 100;
    return { '--bg-opacity': v } as StyleValue;
  },

  // ── Background gradient (CSS variable gradient stops, web-only) ──────────
  'bg-gradient-to': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const directions: Record<string, string> = {
      t: 'to top', tr: 'to top right', r: 'to right', br: 'to bottom right',
      b: 'to bottom', bl: 'to bottom left', l: 'to left', tl: 'to top left',
    };
    const dir = directions[value];
    if (!dir) return null;
    return {
      backgroundImage: `linear-gradient(${dir}, var(--kb-gradient-from, transparent), var(--kb-gradient-stops, transparent))`,
    } as StyleValue;
  },
  from: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    if (!color) return null;
    return {
      '--kb-gradient-from': color,
      '--kb-gradient-stops': `var(--kb-gradient-from), var(--kb-gradient-to, transparent)`,
    } as StyleValue;
  },
  via: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    if (!color) return null;
    return {
      '--kb-gradient-via': color,
      '--kb-gradient-stops': `var(--kb-gradient-from), var(--kb-gradient-via), var(--kb-gradient-to, transparent)`,
    } as StyleValue;
  },
  to: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    if (!color) return null;
    return { '--kb-gradient-to': color } as StyleValue;
  },

  // ── Tint color (native-only, for Image and icon components) ──────────────
  tint: ({ value, isArbitrary }, { colors }) => {
    if (getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    return color ? { tintColor: color } as StyleValue : null;
  },

  // ── Caret color (web-only) ────────────────────────────────────────────────
  caret: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto' || value === 'transparent') return { caretColor: value } as StyleValue;
    const color = resolveColor(value, colors, isArbitrary);
    return color ? { caretColor: color } as StyleValue : null;
  },

  // ── Accent color (web-only) ───────────────────────────────────────────────
  accent: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto') return { accentColor: 'auto' } as StyleValue;
    const color = resolveColor(value, colors, isArbitrary);
    return color ? { accentColor: color } as StyleValue : null;
  },
};
