import { getEffectiveIsWeb, toNativeValue } from '../platform';
import { resolveColor } from './color';
import type { Resolver } from './types';

// ─── Misc resolvers ─────────────────────────────────────────────────────────────

export const miscResolvers: Record<string, Resolver> = {
  // ── Arbitrary CSS property (web-only): [property:value] with no utility prefix ──
  // e.g. [mask-type:luminance], [--my-var:10px]. parser.ts already isolates this case
  // as utility: '' — it's ALSO how a stray, prefix-less negative bracket ("-[10px]",
  // presumably a typo) parses, which is why this only fires when the arbitrary value
  // itself contains a "property:value" pair; anything else (no colon) still resolves
  // to null exactly as before this resolver existed, rather than guessing a property.
  //
  // Only the FIRST colon splits property from value — the value itself may contain
  // more colons (a URL's "http://…") and must stay intact: [background:url(http://x/a.png)].
  // camelToKebab() in resolver.ts is a no-op on an already-kebab-case (or "--"-prefixed
  // custom property) key, so it can be used as the style object key as-written with no
  // extra case conversion — it only needs to look like a plausible CSS property name.
  '': ({ value, isArbitrary, negative }) => {
    if (!getEffectiveIsWeb() || !isArbitrary || !value) return null;
    // A leading "-" has no meaning for an arbitrary property (there's no sign to
    // flip, unlike a spacing utility) — "-[color:red]" is far more likely a typo
    // than an intentional negative CSS property, so reject it rather than silently
    // dropping the "-" and applying color:red anyway as if it had been written
    // correctly. Real negative arbitrary VALUES still work fine either way, since
    // the "-" there belongs inside the brackets as part of the value itself, e.g.
    // [margin-top:-10px] — that's a completely different token, never reaches here
    // with negative:true at all.
    if (negative) return null;
    const colonIdx = value.indexOf(':');
    if (colonIdx <= 0) return null;
    const prop = value.slice(0, colonIdx).trim();
    const cssValue = value.slice(colonIdx + 1).trim();
    if (!cssValue || !/^(--[\w-]+|[a-zA-Z-]+)$/.test(prop)) return null;
    return { [prop]: cssValue };
  },

  // ── SVG stroke/fill (web-only) ────────────────────────────────────────────
  // Native is intentionally excluded: react-native-svg's <Path>/<Circle>/etc.
  // take stroke/fill as component PROPS, not style entries, so there's no
  // reliable way to apply a resolved color through the `style` prop there.
  // `stroke-{n}` sets strokeWidth (a plain number, unlike a color) — same
  // color-first-then-numeric-fallback disambiguation `border` uses above.
  stroke: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value) return null;
    if (value === 'none') return { stroke: 'none' };
    if (isArbitrary) {
      const w = toNativeValue(value);
      return typeof w === 'number' ? { strokeWidth: w } : { stroke: value };
    }
    const color = resolveColor(value, colors, false);
    if (color) return { stroke: color };
    const n = parseFloat(value);
    return isNaN(n) ? null : { strokeWidth: n };
  },
  fill: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value) return null;
    if (value === 'none') return { fill: 'none' };
    if (isArbitrary) return { fill: value };
    const color = resolveColor(value, colors, false);
    return color ? { fill: color } : null;
  },

  // ── Text shadow (cross-platform: iOS, Android, web) ─────────────────────
  // Named presets give cross-platform shadow; arbitrary is web-only.
  'text-shadow': ({ value, isArbitrary }, { colors }) => {
    if (value === 'none') {
      return getEffectiveIsWeb()
        ? { textShadow: 'none' }
        : { textShadowColor: 'transparent', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0 };
    }
    type NativePreset = { textShadowColor: string; textShadowOffset: { width: number; height: number }; textShadowRadius: number };
    const webPresets: Record<string, string> = {
      '':   '0 2px 4px rgba(0,0,0,0.3)',
      sm:   '0 1px 2px rgba(0,0,0,0.3)',
      md:   '0 4px 6px rgba(0,0,0,0.3)',
      lg:   '0 8px 16px rgba(0,0,0,0.5)',
      xl:   '0 16px 32px rgba(0,0,0,0.5)',
    };
    const nativePresets: Record<string, NativePreset> = {
      '':   { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 },  textShadowRadius: 4  },
      sm:   { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 },  textShadowRadius: 2  },
      md:   { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 4 },  textShadowRadius: 6  },
      lg:   { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 8 },  textShadowRadius: 16 },
      xl:   { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 16 }, textShadowRadius: 32 },
    };
    if (value in webPresets) {
      if (getEffectiveIsWeb()) return { textShadow: webPresets[value] };
      return nativePresets[value] ?? null;
    }
    if (isArbitrary) {
      return getEffectiveIsWeb() ? { textShadow: value.replace(/_/g, ' ') } : null;
    }
    // Color token: set shadow color only (keeps last preset's offset/radius on native)
    const color = resolveColor(value, colors, false);
    if (color) {
      return getEffectiveIsWeb()
        ? { textShadow: `0 2px 4px ${color}` }
        : { textShadowColor: color };
    }
    return null;
  },
};
