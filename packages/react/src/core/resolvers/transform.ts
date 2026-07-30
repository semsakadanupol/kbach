import { getEffectiveIsWeb } from '../platform';
import type { Resolver } from './types';

// ─── Transform-family resolvers ────────────────────────────────────────────────

export const transformResolvers: Record<string, Resolver> = {
  // ── Transform extras (web-only) ───────────────────────────────────────────
  'skew-x': ({ value, negative, isArbitrary }) => {
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    return getEffectiveIsWeb()
      ? { transform: `skewX(${deg})` }
      : { transform: [{ skewX: deg }] };
  },
  'skew-y': ({ value, negative, isArbitrary }) => {
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    return getEffectiveIsWeb()
      ? { transform: `skewY(${deg})` }
      : { transform: [{ skewY: deg }] };
  },
  // Arbitrary full transform string: transform-[rotate(45deg)_scale(1.5)]
  transform: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { transform: value.replace(/_/g, ' ') };
    if (value === 'none') return { transform: 'none' };
    return null;
  },
  // Transform origin
  origin: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { transformOrigin: value.replace(/_/g, ' ') };
    const origins: Record<string, string> = {
      center: 'center', top: 'top', 'top-right': 'top right',
      right: 'right', 'bottom-right': 'bottom right',
      bottom: 'bottom', 'bottom-left': 'bottom left',
      left: 'left', 'top-left': 'top left',
    };
    return origins[value] ? { transformOrigin: origins[value] } : null;
  },

  // ── Scale ──────────────────────────────────────────────────────────────────
  // Non-arbitrary: scale-150 → value='150' → 150/100 = 1.5
  // Arbitrary:     scale-[1.5] → value='1.5' → used as-is (already the factor)
  scale: ({ value, isArbitrary }) => {
    const n = isArbitrary ? parseFloat(value) : parseFloat(value) / 100;
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `scale(${n})` }
      : { transform: [{ scale: n }] };
  },
  'scale-x': ({ value, isArbitrary }) => {
    const n = isArbitrary ? parseFloat(value) : parseFloat(value) / 100;
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `scaleX(${n})` }
      : { transform: [{ scaleX: n }] };
  },
  'scale-y': ({ value, isArbitrary }) => {
    const n = isArbitrary ? parseFloat(value) : parseFloat(value) / 100;
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `scaleY(${n})` }
      : { transform: [{ scaleY: n }] };
  },

  // ── Rotate ─────────────────────────────────────────────────────────────────
  rotate: ({ value, negative, isArbitrary }) => {
    if (isArbitrary) {
      // Pass value as-is so units (deg/rad/turn/grad) are preserved.
      // Both web CSS and React Native's rotate transform accept a string like '45deg'.
      const finalValue = negative ? `-${value}` : value;
      return getEffectiveIsWeb()
        ? { transform: `rotate(${finalValue})` }
        : { transform: [{ rotate: finalValue }] };
    }
    const deg = parseFloat(value);
    if (isNaN(deg)) return null;
    const finalDeg = negative ? -deg : deg;
    return getEffectiveIsWeb()
      ? { transform: `rotate(${finalDeg}deg)` }
      : { transform: [{ rotate: `${finalDeg}deg` }] };
  },

  // ── Perspective transform (cross-platform: iOS, Android, web) ────────────
  perspective: ({ value, isArbitrary }) => {
    if (isArbitrary) {
      const numPx = parseFloat(value);
      if (getEffectiveIsWeb()) return { transform: `perspective(${value})` };
      return isNaN(numPx) ? null : { transform: [{ perspective: numPx }] };
    }
    if (value === 'none') return getEffectiveIsWeb() ? { transform: 'none' } : null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `perspective(${n}px)` }
      : { transform: [{ perspective: n }] };
  },
};
