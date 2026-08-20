/**
 * Makes a NARROW class of percentage-relative `calc()` actually resolve on
 * native — `w-[calc(100%_-_3rem)]`, `h-[calc(50%_+_16px)]` — by measuring
 * the element's own layout (via `onLayout`) instead of trying to compute it
 * ahead of time, which is fundamentally impossible without knowing the
 * parent's actual pixel size (see `resolve_style.rs`'s own doc comment on
 * why the constant-only reducer can't handle this case at all).
 *
 * Scoped deliberately narrow: exactly ONE percentage term and ONE constant
 * term (px/rem/bare, reduced the same way `reduceConstantMath` already
 * does), joined by a single `+`/`-`, on `width` or `height` only. Anything
 * more complex (multiple percentages, `*`/`/`, other properties, viewport
 * units, ...) returns `null` here and falls through unchanged to the
 * existing "not a valid native value" drop-and-warn path — reducing PART
 * of an expression and guessing at the rest would silently produce a wrong
 * number, worse than not resolving at all (same principle `calc.ts` itself
 * already follows).
 */
import { reduceConstantMath } from './jsEngine/calc';

export interface PercentRelativeCalc {
  property: 'width' | 'height';
  /** e.g. 100 for `calc(100% - 3rem)`, or -100 for `calc(3rem - 100%)`. */
  percentCoefficient: number;
  /** Already signed — e.g. -48 for `- 3rem`, +16 for `+ 16px`. */
  constantPx: number;
}

const PERCENT_CALC_TOKEN_RE = /^(w|h)-\[calc\(([^)]+)\)\]$/;

/** `token` is a single whitespace-split class token, e.g. `w-[calc(100%_-_3rem)]`. */
export function parsePercentRelativeCalc(token: string): PercentRelativeCalc | null {
  const m = PERCENT_CALC_TOKEN_RE.exec(token);
  if (!m) return null;
  const property = m[1] === 'w' ? 'width' : 'height';
  // Underscore -> space, same convention every other arbitrary value uses
  // (see parser.rs's own multi-part arbitrary-value handling) — by the
  // time a raw className string reaches this function, nothing upstream
  // has done this conversion yet (that normally happens deep inside
  // resolveStyle/the Rust parser, which this value never reaches at all).
  const inner = m[2]!.replace(/_/g, ' ').trim();

  // "N% <op> constant"
  let mm = /^(-?[\d.]+)%\s*([+-])\s*(.+)$/.exec(inner);
  if (mm) {
    const percentCoefficient = Number(mm[1]);
    const magnitude = reduceConstantMath(`calc(${mm[3]!.trim()})`);
    if (!Number.isFinite(percentCoefficient) || magnitude === null) return null;
    return { property, percentCoefficient, constantPx: mm[2] === '+' ? magnitude : -magnitude };
  }

  // "constant <op> N%"
  mm = /^(.+?)\s*([+-])\s*(-?[\d.]+)%$/.exec(inner);
  if (mm) {
    const constantPx = reduceConstantMath(`calc(${mm[1]!.trim()})`);
    const percentMagnitude = Number(mm[3]);
    if (constantPx === null || !Number.isFinite(percentMagnitude)) return null;
    return { property, percentCoefficient: mm[2] === '+' ? percentMagnitude : -percentMagnitude, constantPx };
  }

  return null;
}

/** `basisPx` is the element's own measured size for `calc.property` (its layout width/height once `100%` has been resolved by RN's own layout engine — see jsxRuntimeCore.ts's own usage). */
export function resolvePercentRelativeCalc(basisPx: number, calc: PercentRelativeCalc): number {
  return (basisPx * calc.percentCoefficient) / 100 + calc.constantPx;
}
