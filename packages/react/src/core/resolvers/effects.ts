import type { StyleValue } from '../types';
import { getEffectiveIsWeb } from '../platform';
import type { Resolver } from './types';

// ── Custom @keyframes support (kbach.config.js theme.extend.keyframes) ────────
// A small, self-contained camelCase → kebab-case declaration formatter — NOT the
// shared one in resolver.ts, since resolver.ts already imports FROM this file (via
// utilities.ts) and importing back would be circular. Keyframe step values are
// expected as plain strings (theme.extend.keyframes' own JSDoc documents this) —
// unlike resolver.ts's styleValueToCSS, this does not guess a "px" suffix for bare
// numbers, since most keyframe declarations (transform, opacity, color) don't want
// one anyway; write `top: '10px'` explicitly for the rare property that does.
function keyframeDeclToCSS(decl: Record<string, string | number>): string {
  return Object.entries(decl)
    .map(([prop, val]) => `${prop.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${val}`)
    .join('; ');
}

function buildKeyframeCSS(name: string, steps: Record<string, StyleValue>): string {
  const body = Object.entries(steps)
    .map(([selector, decl]) => `${selector} { ${keyframeDeclToCSS(decl as Record<string, string | number>)} }`)
    .join(' ');
  return `@keyframes ${name} { ${body} }`;
}

type AnimDef = { animation: string; __keyframe?: string };

// The 4 built-in presets, keyed by their PUBLIC name (what you actually write:
// animate-spin) — the animation shorthand inside points at an internal "kb-"
// prefixed keyframe name instead of the bare public one (kb-spin, not spin) so it
// never collides with an unrelated @keyframes spin the user defines themselves.
const BUILTIN_ANIMATIONS: Record<string, AnimDef> = {
  none:   { animation: 'none' },
  spin:   {
    animation:   'kb-spin 1s linear infinite',
    __keyframe:  '@keyframes kb-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }',
  },
  ping:   {
    animation:   'kb-ping 1s cubic-bezier(0,0,0.2,1) infinite',
    __keyframe:  '@keyframes kb-ping { 75%, 100% { transform: scale(2); opacity: 0 } }',
  },
  pulse:  {
    animation:   'kb-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
    __keyframe:  '@keyframes kb-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }',
  },
  bounce: {
    animation:   'kb-bounce 1s infinite',
    __keyframe:  '@keyframes kb-bounce { 0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8,0,1,1) } 50% { transform: none; animation-timing-function: cubic-bezier(0,0,0.2,1) } }',
  },
};

// Shared by the animate-{name} (built-in preset AND theme.extend.animation lookup)
// and animate-[...] (arbitrary value) branches: an animation shorthand's first word
// is always its keyframe name (`animation: 'wiggle 1s ease-in-out infinite'` →
// 'wiggle'). Two sources for that name's actual @keyframes body:
//  1. A built-in preset's public name (spin/ping/pulse/bounce) — its shorthand's
//     real keyframe name is "kb-"+that (kb-spin, not spin), so the word gets
//     substituted before returning; otherwise the shorthand would reference a
//     keyframe that's never actually injected. This is what makes overriding a
//     built-in's timing work — animate-[spin_3s_linear_infinite] — since there's
//     no other way to touch animation-duration (duration-* only ever sets
//     transition-duration, never animation-duration).
//  2. theme.extend.keyframes, for a fully custom one.
// No match on either (a plain CSS-global keyframe name the user defined outside
// Kbach, or a typo) just sets `animation` with nothing to animate — never a hard
// error, since there's no reliable way to distinguish "typo" from "intentionally
// external" here.
function buildAnimationValue(animation: string, keyframes: Record<string, Record<string, StyleValue>>): StyleValue {
  const words = animation.trim().split(/\s+/);
  const name = words[0];
  if (!name) return { animation } as StyleValue;

  const builtin = BUILTIN_ANIMATIONS[name];
  if (builtin?.__keyframe) {
    const kbName = builtin.animation.split(/\s+/, 1)[0];
    return { animation: [kbName, ...words.slice(1)].join(' '), __keyframe: builtin.__keyframe } as StyleValue;
  }

  const steps = keyframes?.[name];
  return steps ? { animation, __keyframe: buildKeyframeCSS(name, steps) } as StyleValue : { animation } as StyleValue;
}

// ─── Effect-family resolvers ────────────────────────────────────────────────────

export const effectResolvers: Record<string, Resolver> = {
  // ── Opacity ────────────────────────────────────────────────────────────────
  opacity: ({ value, isArbitrary }, { opacity }) => {
    if (isArbitrary) {
      // Accept raw float (0.5) or percentage-like (50)
      const v = parseFloat(value);
      return isNaN(v) ? null : { opacity: v > 1 ? v / 100 : v };
    }
    const v = opacity[value];
    if (v !== undefined) return { opacity: v };
    const n = parseFloat(value);
    return isNaN(n) ? null : { opacity: n > 1 ? n / 100 : n };
  },

  // ── Shadow ─────────────────────────────────────────────────────────────────
  shadow: ({ value }, { shadow }) => {
    const key = value === '' ? 'DEFAULT' : value;
    return shadow[key] ?? null;
  },

  // ── Animations (CSS keyframe animations, web-only) ────────────────────────
  // Each variant injects a @keyframes rule once via the __keyframe marker.
  // resolver.ts detects __keyframe, injects the rule, then strips the marker
  // so it never reaches element inline styles.
  animate: ({ value, isArbitrary }, theme) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return buildAnimationValue(value.replace(/_/g, ' '), theme.keyframes);
    if (value in BUILTIN_ANIMATIONS) return BUILTIN_ANIMATIONS[value] as StyleValue;

    // Custom animation from kbach.config.js theme.extend.animation, e.g.
    // animation: { wiggle: 'wiggle 1s ease-in-out infinite' } — referenced as animate-wiggle.
    const custom = theme.animation?.[value];
    return custom ? buildAnimationValue(custom, theme.keyframes) : null;
  },

  // ── Transition (web-only; use Animated API on native) ─────────────────────
  transition: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const presets: Record<string, string> = {
      '': 'color 150ms, background-color 150ms, border-color 150ms, text-decoration-color 150ms, fill 150ms, stroke 150ms, opacity 150ms, box-shadow 150ms, transform 150ms, filter 150ms, backdrop-filter 150ms',
      all: 'all 150ms',
      none: 'none',
      colors: 'color 150ms, background-color 150ms, border-color 150ms',
      opacity: 'opacity 150ms',
      shadow: 'box-shadow 150ms',
      transform: 'transform 150ms',
    };
    const v = presets[value];
    return v !== undefined ? { transition: v } : null;
  },

  duration: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    const ms = isArbitrary ? value : `${value}ms`;
    return { transitionDuration: ms };
  },

  delay: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    const ms = isArbitrary ? value : `${value}ms`;
    return { transitionDelay: ms };
  },

  ease: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { transitionTimingFunction: value };
    const presets: Record<string, string> = {
      linear: 'linear',
      in: 'cubic-bezier(0.4, 0, 1, 1)',
      out: 'cubic-bezier(0, 0, 0.2, 1)',
      'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
    };
    const v = presets[value];
    return v !== undefined ? { transitionTimingFunction: v } : null;
  },
};
