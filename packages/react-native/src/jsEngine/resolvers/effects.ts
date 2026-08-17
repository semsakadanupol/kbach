/**
 * Port of `resolvers/effects.rs`'s `native_shadow_declarations` (and its
 * backing `native_shadow_value` tier table) only — the rest of effects.rs
 * (`shadow_value`'s web `box-shadow` scale, text-shadow, blend modes,
 * animate-*, transition/duration/delay/ease, cursor/select/pointer-events)
 * is web/CSS-only with no RN equivalent and stays excluded, mirroring
 * `resolve_utility_native`'s doc comment.
 */
import { decl, type Declaration } from '../shared';
import type { ParsedClass } from '../parser';

interface NativeShadow {
  offsetY: number;
  radius: number;
  opacity: number;
  elevation: number;
}

function nativeShadowValue(key: string): NativeShadow | null {
  switch (key) {
    case 'sm': return { offsetY: 1, radius: 2, opacity: 0.05, elevation: 1 };
    case 'DEFAULT': return { offsetY: 1, radius: 3, opacity: 0.1, elevation: 2 };
    case 'md': return { offsetY: 4, radius: 6, opacity: 0.1, elevation: 4 };
    case 'lg': return { offsetY: 10, radius: 15, opacity: 0.1, elevation: 8 };
    case 'xl': return { offsetY: 20, radius: 25, opacity: 0.1, elevation: 12 };
    case '2xl': return { offsetY: 25, radius: 50, opacity: 0.25, elevation: 16 };
    case 'none': return { offsetY: 0, radius: 0, opacity: 0, elevation: 0 };
    default: return null;
  }
}

/**
 * Emits flat declarations only (including two synthetic `shadow-offset-x`/
 * `shadow-offset-y` keys resolveStyle.ts merges into a nested
 * `shadowOffset: {width, height}` object). Arbitrary shadow values
 * (`shadow-[...]`) aren't supported — a raw CSS box-shadow string has no
 * mechanical translation into RN's discrete shadow keys.
 */
export function nativeShadowDeclarations(parsed: ParsedClass): Declaration[] | null {
  if (parsed.utility !== 'shadow' || parsed.isArbitrary) return null;
  const key = parsed.value ?? 'DEFAULT';
  const s = nativeShadowValue(key);
  if (s === null) return null;
  return [
    decl('shadow-color', '#000000'),
    decl('shadow-offset-x', '0'),
    decl('shadow-offset-y', String(s.offsetY)),
    decl('shadow-opacity', String(s.opacity)),
    decl('shadow-radius', String(s.radius)),
    decl('elevation', String(s.elevation)),
  ];
}
