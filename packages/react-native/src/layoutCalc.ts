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
import { reduceConstantMath, splitTopLevelCommas } from './jsEngine/calc';

export interface PercentRelativeCalc {
  property: 'width' | 'height';
  /** e.g. 100 for `calc(100% - 3rem)`, or -100 for `calc(3rem - 100%)`. */
  percentCoefficient: number;
  /** Already signed — e.g. -48 for `- 3rem`, +16 for `+ 16px`. */
  constantPx: number;
}

/** Common shape any percentage-relative expression (`calc()`, `min()`, `max()`, `clamp()`) reduces to — see `parsePercentRelativeExpr`'s own doc comment. */
export interface PercentRelativeExpr {
  property: 'width' | 'height';
  resolve(basisPx: number): number;
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

const PERCENT_MIN_MAX_CLAMP_TOKEN_RE = /^(w|h)-\[(min|max|clamp)\(([^)]+)\)\]$/;

/** One `min()`/`max()`/`clamp()` argument, reduced to the same `(percent, constant)` linear shape `PercentRelativeCalc` already uses — a plain percentage has `constantPx: 0`, a plain constant has `percentCoefficient: 0`. Deliberately does NOT support an argument that mixes both in one operand (`min(50%_-_3rem,_20rem)`) — same "reduce fully or bail" scope boundary this file's own doc comment already applies to `calc()`. */
function parseOperand(arg: string): { percentCoefficient: number; constantPx: number } | null {
  const trimmed = arg.trim();
  const pct = /^(-?[\d.]+)%$/.exec(trimmed);
  if (pct) {
    const percentCoefficient = Number(pct[1]);
    return Number.isFinite(percentCoefficient) ? { percentCoefficient, constantPx: 0 } : null;
  }
  const constantPx = reduceConstantMath(`calc(${trimmed})`);
  return constantPx === null ? null : { percentCoefficient: 0, constantPx };
}

/**
 * The `min()`/`max()`/`clamp()` counterpart to `parsePercentRelativeCalc` —
 * same reasoning (native has no way to know "100% of what" ahead of time,
 * so a percentage operand can only be resolved once the element's own
 * layout is measured), extended to cover these three functions too rather
 * than leaving them as calc()-only. Each argument is parsed independently
 * via `parseOperand`; if ANY argument fails to reduce, the whole expression
 * returns `null` (falls through to the ordinary "not a valid native value"
 * drop-and-warn path) — same all-or-nothing philosophy as `calc()`. Returns
 * `null` if EVERY argument is a plain constant, too: that case has no
 * percentage at all, so it's already handled correctly and more cheaply by
 * `reduceConstantMath` directly (see `resolveStyle.ts`'s `rnStyleValue`) —
 * this function exists only for the case at least one argument is a real
 * percentage.
 */
function parsePercentRelativeMinMaxClamp(token: string): PercentRelativeExpr | null {
  const m = PERCENT_MIN_MAX_CLAMP_TOKEN_RE.exec(token);
  if (!m) return null;
  const property = m[1] === 'w' ? 'width' : 'height';
  const kind = m[2] as 'min' | 'max' | 'clamp';
  const args = splitTopLevelCommas(m[3]!.replace(/_/g, ' '));
  if (kind === 'clamp' && args.length !== 3) return null;
  if (kind !== 'clamp' && args.length < 1) return null;

  const operands = args.map(parseOperand);
  if (operands.some((o) => o === null)) return null;
  const resolved = operands as { percentCoefficient: number; constantPx: number }[];
  if (!resolved.some((o) => o.percentCoefficient !== 0)) return null; // no percentage at all — defer to reduceConstantMath instead

  const resolveOperand = (o: { percentCoefficient: number; constantPx: number }, basisPx: number) =>
    (basisPx * o.percentCoefficient) / 100 + o.constantPx;

  return {
    property,
    resolve(basisPx: number): number {
      const values = resolved.map((o) => resolveOperand(o, basisPx));
      if (kind === 'min') return Math.min(...values);
      if (kind === 'max') return Math.max(...values);
      const [min, preferred, max] = values as [number, number, number];
      return Math.max(min, Math.min(preferred, max));
    },
  };
}

/**
 * Unified entry point `jsxRuntimeCore.ts` uses — tries `calc()` first (the
 * original, narrower two-term form), then `min()`/`max()`/`clamp()`.
 * Wraps whichever one matches behind the same `PercentRelativeExpr` shape
 * so the caller never needs to branch on which kind of expression it was.
 */
export function parsePercentRelativeExpr(token: string): PercentRelativeExpr | null {
  const calc = parsePercentRelativeCalc(token);
  if (calc) return { property: calc.property, resolve: (basisPx) => resolvePercentRelativeCalc(basisPx, calc) };
  return parsePercentRelativeMinMaxClamp(token);
}
