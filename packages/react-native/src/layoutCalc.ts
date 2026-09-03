/**
 * Makes percentage-relative `calc()`/`min()`/`max()`/`clamp()` actually
 * resolve on native — `w-[calc(100%-3rem)]`, `w-[calc(100%/2)]`,
 * `h-[min(50%,20rem)]` — by measuring the element's own layout (via
 * `onLayout`) instead of trying to compute it ahead of time, which is
 * fundamentally impossible without knowing the parent's actual pixel size
 * (see `resolve_style.rs`'s own doc comment on why the constant-only
 * reducer can't handle this case at all).
 *
 * The evaluator below tracks every value as a LINEAR COMBINATION of a
 * percentage coefficient and a constant px offset — `{ percent, px }`
 * meaning `percent% + px`— through the full `calc()` grammar (`+`, `-`,
 * `*`, `/`, unary `-`, nested parens), the same recursive-descent shape
 * `jsEngine/calc.ts`'s constant-only `Evaluator` already uses, just with
 * `number` generalized to this pair. A plain percentage literal is
 * `{percent: N, px: 0}`; a plain length is `{percent: 0, px: N}`; `+`/`-`
 * combine both components independently (always valid — a linear
 * combination stays linear under addition); `*`/`/` are valid only when at
 * least one side is a PURE constant (`percent === 0` — you can't multiply
 * or divide by "some fraction of an unknown parent size" and still get a
 * linear result), same restriction real CSS calc() itself has on
 * percentages. This is genuinely more capable than the two-term-only
 * version this replaced (an OLD comment describing that scope lives only
 * in git blame now) — `100%/2`, `(100%/2)-10px`, `100%-50%` (collapsing to
 * one combined percentage) all resolve correctly now, not just "one
 * percent term ± one constant term".
 *
 * Scope that's still deliberately OUT: anything that isn't reducible to
 * ONE linear (percent, px) pair at all — `50% * 50%` (percentage squared
 * isn't a real CSS type), dividing by a percent-involving value, a
 * viewport unit or `var(...)` anywhere in the expression (same reasoning
 * `calc.ts`'s constant reducer already documents: those need real
 * layout/DOM this measure-then-snap trick can't provide either). Any of
 * these makes the WHOLE expression return `null` here — reducing PART of
 * an expression and guessing at the rest would silently produce a wrong
 * number, worse than not resolving at all.
 */
import { splitTopLevelCommas, stripCall } from './jsEngine/calc';

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

/** `percent% + px` — see this file's own top doc comment for the full reasoning. */
interface LinearValue {
  percent: number;
  px: number;
}

const NEG = (v: LinearValue): LinearValue => ({ percent: -v.percent, px: -v.px });
const ADD = (a: LinearValue, b: LinearValue): LinearValue => ({ percent: a.percent + b.percent, px: a.px + b.px });
const SUB = (a: LinearValue, b: LinearValue): LinearValue => ({ percent: a.percent - b.percent, px: a.px - b.px });

/** `a * b` — valid only when at least one side is a pure constant (its own `percent` is 0); returns `null` for "percent times percent", which isn't a real linear value. */
function MUL(a: LinearValue, b: LinearValue): LinearValue | null {
  if (a.percent === 0) return { percent: b.percent * a.px, px: b.px * a.px };
  if (b.percent === 0) return { percent: a.percent * b.px, px: a.px * b.px };
  return null;
}

/** `a / b` — valid only when the divisor is a pure constant (dividing by "some fraction of an unknown size" has no linear result); `null` on division by zero too. */
function DIV(a: LinearValue, b: LinearValue): LinearValue | null {
  if (b.percent !== 0 || b.px === 0) return null;
  return { percent: a.percent / b.px, px: a.px / b.px };
}

/**
 * Recursive-descent evaluator for a single `calc()`-style arithmetic
 * expression over `LinearValue`s — same grammar as `jsEngine/calc.ts`'s
 * constant-only `Evaluator`:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := NUMBER[UNIT] | '(' expr ')'
 * `NUMBER[UNIT]` additionally accepts a trailing `%` here (a plain
 * constant evaluator has no use for it at all, so `calc.ts`'s own version
 * doesn't).
 */
class PercentAwareEvaluator {
  private readonly s: string;
  private pos = 0;

  constructor(s: string) {
    this.s = s;
  }

  parseExprToEnd(): LinearValue | null {
    const value = this.expr();
    if (value === null) return null;
    this.skipWs();
    return this.pos === this.s.length ? value : null;
  }

  private skipWs(): void {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos]!)) this.pos++;
  }

  private peek(): string | undefined {
    this.skipWs();
    return this.s[this.pos];
  }

  private expr(): LinearValue | null {
    let value = this.term();
    if (value === null) return null;
    for (;;) {
      const ch = this.peek();
      if (ch === '+') {
        this.pos++;
        const rhs = this.term();
        if (rhs === null) return null;
        value = ADD(value, rhs);
      } else if (ch === '-') {
        this.pos++;
        const rhs = this.term();
        if (rhs === null) return null;
        value = SUB(value, rhs);
      } else {
        return value;
      }
    }
  }

  private term(): LinearValue | null {
    let value = this.factor();
    if (value === null) return null;
    for (;;) {
      const ch = this.peek();
      if (ch === '*') {
        this.pos++;
        const rhs = this.factor();
        if (rhs === null) return null;
        const result = MUL(value, rhs);
        if (result === null) return null;
        value = result;
      } else if (ch === '/') {
        this.pos++;
        const rhs = this.factor();
        if (rhs === null) return null;
        const result = DIV(value, rhs);
        if (result === null) return null;
        value = result;
      } else {
        return value;
      }
    }
  }

  private factor(): LinearValue | null {
    const ch = this.peek();
    if (ch === undefined) return null;
    if (ch === '(') {
      this.pos++;
      const value = this.expr();
      if (value === null || this.peek() !== ')') return null;
      this.pos++;
      return value;
    }
    if (ch === '-') {
      this.pos++;
      const value = this.factor();
      return value === null ? null : NEG(value);
    }
    return this.numberWithUnit();
  }

  private numberWithUnit(): LinearValue | null {
    this.skipWs();
    const start = this.pos;
    while (this.pos < this.s.length && (/[0-9]/.test(this.s[this.pos]!) || this.s[this.pos] === '.')) this.pos++;
    if (this.pos === start) return null;
    const n = Number(this.s.slice(start, this.pos));
    if (!Number.isFinite(n)) return null;

    if (this.s[this.pos] === '%') {
      this.pos++;
      return { percent: n, px: 0 };
    }

    // Only px/rem are understood as constants — anything else (vw, vh,
    // dvh, ch, cm, ...) makes this whole reduction fail, same restriction
    // calc.ts's own constant-only evaluator already documents.
    const unitStart = this.pos;
    while (this.pos < this.s.length && /[a-zA-Z]/.test(this.s[this.pos]!)) this.pos++;
    const unit = this.s.slice(unitStart, this.pos);
    switch (unit) {
      case '':
        return { percent: 0, px: n };
      case 'px':
        return { percent: 0, px: n };
      case 'rem':
        return { percent: 0, px: n * 16 };
      default:
        return null;
    }
  }
}

const PERCENT_TOKEN_OUTER_RE = /^(w|h)-\[(.+)\]$/;

/** `token` is a single whitespace-split class token, e.g. `w-[calc(100%-3rem)]`. */
export function parsePercentRelativeCalc(token: string): PercentRelativeCalc | null {
  const m = PERCENT_TOKEN_OUTER_RE.exec(token);
  if (!m) return null;
  const property = m[1] === 'w' ? 'width' : 'height';
  // Underscore -> space, same convention every other arbitrary value uses
  // (see parser.rs's own multi-part arbitrary-value handling) — by the
  // time a raw className string reaches this function, nothing upstream
  // has done this conversion yet (that normally happens deep inside
  // resolveStyle/the Rust parser, which this value never reaches at all).
  const inner = stripCall(m[2]!.replace(/_/g, ' ').trim(), 'calc');
  if (inner === null) return null;

  const result = new PercentAwareEvaluator(inner).parseExprToEnd();
  // No percentage at all — already handled correctly and more cheaply by
  // reduceConstantMath directly (see nativeBridge.ts's rnStyleValue).
  if (result === null || result.percent === 0) return null;
  return { property, percentCoefficient: result.percent, constantPx: result.px };
}

/** `basisPx` is the element's own measured size for `calc.property` (its layout width/height once `100%` has been resolved by RN's own layout engine — see jsxRuntimeCore.ts's own usage). */
export function resolvePercentRelativeCalc(basisPx: number, calc: PercentRelativeCalc): number {
  return (basisPx * calc.percentCoefficient) / 100 + calc.constantPx;
}

/**
 * The `min()`/`max()`/`clamp()` counterpart to `parsePercentRelativeCalc` —
 * same reasoning (native has no way to know "100% of what" ahead of time,
 * so a percentage anywhere in an argument can only be resolved once the
 * element's own layout is measured), extended to cover these three
 * functions too rather than leaving them as calc()-only. Each argument is
 * evaluated independently by the SAME `PercentAwareEvaluator` `calc()`
 * uses — so an argument can be a full expression (`min(50%-1rem,20rem)`),
 * not just a bare percent or bare constant. If ANY argument fails to
 * reduce, the whole expression returns `null` (falls through to the
 * ordinary "not a valid native value" drop-and-warn path) — same
 * all-or-nothing philosophy as `calc()`. Returns `null` if EVERY argument
 * is a plain constant, too: that case has no percentage at all, so it's
 * already handled correctly and more cheaply by `reduceConstantMath`
 * directly (see `resolveStyle.ts`'s `rnStyleValue`) — this function exists
 * only for the case at least one argument is a real percentage.
 */
function parsePercentRelativeMinMaxClamp(token: string): PercentRelativeExpr | null {
  const m = PERCENT_TOKEN_OUTER_RE.exec(token);
  if (!m) return null;
  const property = m[1] === 'w' ? 'width' : 'height';
  const spaced = m[2]!.replace(/_/g, ' ');

  let kind: 'min' | 'max' | 'clamp';
  let inner: string | null;
  if ((inner = stripCall(spaced, 'min')) !== null) kind = 'min';
  else if ((inner = stripCall(spaced, 'max')) !== null) kind = 'max';
  else if ((inner = stripCall(spaced, 'clamp')) !== null) kind = 'clamp';
  else return null;

  const args = splitTopLevelCommas(inner);
  if (kind === 'clamp' && args.length !== 3) return null;
  if (kind !== 'clamp' && args.length < 1) return null;

  const operands = args.map((arg) => new PercentAwareEvaluator(arg.trim()).parseExprToEnd());
  if (operands.some((o) => o === null)) return null;
  const resolved = operands as LinearValue[];
  if (!resolved.some((o) => o.percent !== 0)) return null; // no percentage at all — defer to reduceConstantMath instead

  return {
    property,
    resolve(basisPx: number): number {
      const values = resolved.map((o) => (basisPx * o.percent) / 100 + o.px);
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
