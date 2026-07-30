import type { StyleValue } from '../types';
import { getEffectiveIsWeb } from '../platform';
import type { Resolver } from './types';

// ─── CSS variable compose strings for stackable filter utilities ──────────────
// Each filter/backdrop utility sets its own CSS variable AND emits the same combined
// `filter` string. Multiple utilities on the same element each set a different var,
// and the shared expression reads them all — composable without JS post-processing.

export const FILTER_COMPOSE =
  'var(--kb-blur,) var(--kb-brightness,) var(--kb-contrast,) var(--kb-grayscale,) var(--kb-hue-rotate,) var(--kb-invert,) var(--kb-saturate,) var(--kb-sepia,) var(--kb-drop-shadow,)';

export const BACKDROP_FILTER_COMPOSE =
  'var(--kb-backdrop-blur,) var(--kb-backdrop-brightness,) var(--kb-backdrop-contrast,) var(--kb-backdrop-grayscale,) var(--kb-backdrop-hue-rotate,) var(--kb-backdrop-invert,) var(--kb-backdrop-opacity,) var(--kb-backdrop-saturate,) var(--kb-backdrop-sepia,)';

// ─── Filter-family resolvers ───────────────────────────────────────────────────

export const filterResolvers: Record<string, Resolver> = {
  // ── CSS Filters (composable via CSS variables, web-only) ─────────────────
  blur: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const sizes: Record<string, string> = {
      '': 'blur(8px)', sm: 'blur(4px)', md: 'blur(12px)',
      lg: 'blur(16px)', xl: 'blur(24px)', '2xl': 'blur(40px)', '3xl': 'blur(64px)',
    };
    if (value === 'none') return { '--kb-blur': '', filter: FILTER_COMPOSE } as StyleValue;
    const v = isArbitrary ? `blur(${value})` : sizes[value];
    return v !== undefined ? { '--kb-blur': v, filter: FILTER_COMPOSE } as StyleValue : null;
  },
  brightness: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `brightness(${value})` : `brightness(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--kb-brightness': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  contrast: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `contrast(${value})` : `contrast(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--kb-contrast': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  grayscale: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = value === '0' ? 'grayscale(0)' : 'grayscale(100%)';
    return { '--kb-grayscale': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  'hue-rotate': ({ value, negative, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (isNaN(parseFloat(deg)) && !isArbitrary) return null;
    return { '--kb-hue-rotate': `hue-rotate(${deg})`, filter: FILTER_COMPOSE } as StyleValue;
  },
  invert: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = value === '0' ? 'invert(0)' : 'invert(100%)';
    return { '--kb-invert': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  saturate: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `saturate(${value})` : `saturate(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--kb-saturate': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  sepia: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = value === '0' ? 'sepia(0)' : 'sepia(100%)';
    return { '--kb-sepia': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  'drop-shadow': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { '--kb-drop-shadow': `drop-shadow(${value.replace(/_/g, ' ')})`, filter: FILTER_COMPOSE } as StyleValue;
    const presets: Record<string, string> = {
      '': 'drop-shadow(0 1px 2px rgb(0 0 0/0.1)) drop-shadow(0 1px 1px rgb(0 0 0/0.06))',
      sm: 'drop-shadow(0 1px 1px rgb(0 0 0/0.05))',
      md: 'drop-shadow(0 4px 3px rgb(0 0 0/0.07)) drop-shadow(0 2px 2px rgb(0 0 0/0.06))',
      lg: 'drop-shadow(0 10px 8px rgb(0 0 0/0.04)) drop-shadow(0 4px 3px rgb(0 0 0/0.1))',
      xl: 'drop-shadow(0 20px 13px rgb(0 0 0/0.03)) drop-shadow(0 8px 5px rgb(0 0 0/0.08))',
      '2xl': 'drop-shadow(0 25px 25px rgb(0 0 0/0.15))',
      none: 'drop-shadow(0 0 #0000)',
    };
    const v = presets[value];
    return v !== undefined ? { '--kb-drop-shadow': v, filter: FILTER_COMPOSE } as StyleValue : null;
  },
  // Arbitrary full filter string: filter-[blur(4px)_grayscale(1)]
  filter: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { filter: value.replace(/_/g, ' ') };
    if (value === 'none') return { filter: 'none' };
    return null;
  },

  // ── Backdrop Filters (composable via CSS variables, web-only) ────────────
  'backdrop-blur': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const sizes: Record<string, string> = {
      '': 'blur(8px)', sm: 'blur(4px)', md: 'blur(12px)',
      lg: 'blur(16px)', xl: 'blur(24px)', '2xl': 'blur(40px)', '3xl': 'blur(64px)',
    };
    if (value === 'none') return { '--kb-backdrop-blur': '', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
    const v = isArbitrary ? `blur(${value})` : sizes[value];
    return v !== undefined ? { '--kb-backdrop-blur': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue : null;
  },
  'backdrop-brightness': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `brightness(${value})` : `brightness(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--kb-backdrop-brightness': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-contrast': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `contrast(${value})` : `contrast(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--kb-backdrop-contrast': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-grayscale': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    return { '--kb-backdrop-grayscale': value === '0' ? 'grayscale(0)' : 'grayscale(100%)', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-hue-rotate': ({ value, negative, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (isNaN(parseFloat(deg)) && !isArbitrary) return null;
    return { '--kb-backdrop-hue-rotate': `hue-rotate(${deg})`, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-invert': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    return { '--kb-backdrop-invert': value === '0' ? 'invert(0)' : 'invert(100%)', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-opacity': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `opacity(${value})` : `opacity(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--kb-backdrop-opacity': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-saturate': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `saturate(${value})` : `saturate(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--kb-backdrop-saturate': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-sepia': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    return { '--kb-backdrop-sepia': value === '0' ? 'sepia(0)' : 'sepia(100%)', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-filter': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { backdropFilter: value.replace(/_/g, ' ') };
    if (value === 'none') return { backdropFilter: 'none' };
    return null;
  },

  // ── Mix / background blend mode (web-only) ───────────────────────────────
  'mix-blend': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const modes = [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
      'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
      'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter',
    ];
    return modes.includes(value) ? { mixBlendMode: value } : null;
  },
  'bg-blend': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const modes = [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
      'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
      'exclusion', 'hue', 'saturation', 'color', 'luminosity',
    ];
    return modes.includes(value) ? { backgroundBlendMode: value } as StyleValue : null;
  },

  // ── Will-change (web-only) ─────────────────────────────────────────────────
  'will-change': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { willChange: value.replace(/_/g, ', ') };
    const presets: Record<string, string> = {
      auto: 'auto', scroll: 'scroll-position', contents: 'contents', transform: 'transform',
    };
    return presets[value] ? { willChange: presets[value] } : null;
  },
};
