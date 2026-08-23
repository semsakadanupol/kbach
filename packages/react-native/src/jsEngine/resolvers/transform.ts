/**
 * Port of `resolvers/transform.rs`'s `native_resolve` ONLY — the web half
 * of that file (`resolve`, the CSS-custom-property composition technique)
 * has no RN equivalent and is deliberately not ported here at all (see
 * resolveUtilityNative.ts's own doc comment for the jsEngine's general
 * "native subset only" scope).
 *
 * RN's `transform` style is a plain ordered array of single-key objects
 * (`[{ translateX: 16 }, { rotate: '45deg' }]`) with no cascade to compose
 * against, so — same as the Rust port — each utility here emits one
 * synthetic `"transform-op-*"` marker declaration instead; resolveStyle.ts's
 * own accumulator collects whichever of these appear on an element (last
 * write per op wins) and assembles the final ordered `transform` array from
 * them. `transform-op-none` is a sentinel resolveStyle.ts clears the whole
 * accumulator on, mirroring `transform-none`'s CSS meaning.
 *
 * Deliberately narrower than real Tailwind's full transform vocabulary:
 * `translate-z`/`scale-z` (RN's array has no `translateZ`/`scaleZ` op),
 * `perspective`/`perspective-origin`/`origin` (no stable, version-
 * independent RN equivalent), and `transform-gpu`/`transform-cpu` (no
 * CPU/GPU compositing distinction in RN's style system) all stay
 * unresolved here, same as on the Rust/native-module side.
 */
import { decl, resolveNegatableLength, type Declaration } from '../shared';
import type { ParsedClass } from '../parser';
import type { ThemeConfig } from '../../theme';

/** Non-arbitrary: `scale-150` -> value="150" -> 150/100 = 1.5. Arbitrary: `scale-[1.75]` -> 1.75 directly. */
function scaleFactor(parsed: ParsedClass): number | null {
  if (parsed.value === null) return null;
  const n = Number(parsed.value);
  if (!Number.isFinite(n)) return null;
  return parsed.isArbitrary ? n : n / 100;
}

/** Non-arbitrary: `rotate-45` -> "45deg", negative-aware. Arbitrary: `rotate-[0.5turn]` -> as-is. */
function angle(parsed: ParsedClass): string | null {
  if (parsed.value === null) return null;
  if (parsed.isArbitrary) return parsed.value;
  const n = Number(parsed.value);
  if (!Number.isFinite(n)) return null;
  return `${parsed.negative ? -n : n}deg`;
}

export function resolveNative(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  switch (parsed.utility) {
    case 'transform-none':
      return [decl('transform-op-none', '1')];
    case 'backface-visible':
      return [decl('backface-visibility', 'visible')];
    case 'backface-hidden':
      return [decl('backface-visibility', 'hidden')];
    case 'translate-x': {
      const v = resolveNegatableLength(theme, parsed);
      return v === null ? null : [decl('transform-op-translate-x', v)];
    }
    case 'translate-y': {
      const v = resolveNegatableLength(theme, parsed);
      return v === null ? null : [decl('transform-op-translate-y', v)];
    }
    case 'scale': {
      const n = scaleFactor(parsed);
      return n === null ? null : [decl('transform-op-scale-x', `${n}`), decl('transform-op-scale-y', `${n}`)];
    }
    case 'scale-x': {
      const n = scaleFactor(parsed);
      return n === null ? null : [decl('transform-op-scale-x', `${n}`)];
    }
    case 'scale-y': {
      const n = scaleFactor(parsed);
      return n === null ? null : [decl('transform-op-scale-y', `${n}`)];
    }
    case 'rotate': {
      const deg = angle(parsed);
      return deg === null ? null : [decl('transform-op-rotate', deg)];
    }
    case 'rotate-x': {
      const deg = angle(parsed);
      return deg === null ? null : [decl('transform-op-rotate-x', deg)];
    }
    case 'rotate-y': {
      const deg = angle(parsed);
      return deg === null ? null : [decl('transform-op-rotate-y', deg)];
    }
    case 'rotate-z': {
      const deg = angle(parsed);
      return deg === null ? null : [decl('transform-op-rotate-z', deg)];
    }
    case 'skew-x': {
      const deg = angle(parsed);
      return deg === null ? null : [decl('transform-op-skew-x', deg)];
    }
    case 'skew-y': {
      const deg = angle(parsed);
      return deg === null ? null : [decl('transform-op-skew-y', deg)];
    }
    default:
      return null;
  }
}
