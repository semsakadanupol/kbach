/**
 * Port of `packages/core-engine/src/calc.rs` — reduces a CONSTANT-ONLY
 * `calc()`/`clamp()`/`min()`/`max()` arbitrary value down to a single px
 * number, entirely at resolve time. See that file's own doc comment for
 * the full rationale (why this is narrow — px/rem/bare numbers only — and
 * why a percentage-relative calc() genuinely can't be reduced this way on
 * native). Keep this in sync with calc.rs by hand; there's no shared
 * source between the Rust and JS engines the same way core-engine's WASM
 * build is shared with @kbach/react's web path — see this directory's own
 * top-level doc comment for why the JS engine is a deliberate, hand-ported
 * parity subset rather than a build artifact.
 */

/** `raw` is the arbitrary value's content with its enclosing `[...]` already stripped, e.g. `calc(16px+8px)`. */
export function reduceConstantMath(raw: string): number | null {
  const trimmed = raw.trim();
  const calc = stripCall(trimmed, 'calc');
  if (calc !== null) {
    return new Evaluator(calc).parseExprToEnd();
  }
  const clamp = stripCall(trimmed, 'clamp');
  if (clamp !== null) {
    const args = splitTopLevelCommas(clamp);
    if (args.length !== 3) return null;
    const [min, preferred, max] = args.map((a) => new Evaluator(a).parseExprToEnd());
    if (min === null || preferred === null || max === null) return null;
    // Real CSS clamp(MIN, PREFERRED, MAX) semantics: max(MIN, min(PREFERRED, MAX)).
    return Math.max(min, Math.min(preferred, max));
  }
  const min = stripCall(trimmed, 'min');
  if (min !== null) {
    const values = splitTopLevelCommas(min).map((a) => new Evaluator(a).parseExprToEnd());
    return values.some((v) => v === null) ? null : Math.min(...(values as number[]));
  }
  const max = stripCall(trimmed, 'max');
  if (max !== null) {
    const values = splitTopLevelCommas(max).map((a) => new Evaluator(a).parseExprToEnd());
    return values.some((v) => v === null) ? null : Math.max(...(values as number[]));
  }
  return null;
}

function stripCall(raw: string, name: string): string | null {
  if (!raw.startsWith(name)) return null;
  const afterName = raw.slice(name.length).trimStart();
  if (!afterName.startsWith('(') || !afterName.endsWith(')')) return null;
  return afterName.slice(1, -1);
}

/** Splits on top-level commas only — a comma inside a nested `(...)` doesn't count as an argument separator. Exported for `layoutCalc.ts`'s percentage-relative `min()`/`max()`/`clamp()` support, which needs the exact same argument-splitting this file already does. */
export function splitTopLevelCommas(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(s.slice(start).trim());
  return parts;
}

/**
 * Recursive-descent evaluator for a single `calc()`-style arithmetic
 * expression — same grammar/semantics as calc.rs's `Evaluator`:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := NUMBER[UNIT] | '(' expr ')'
 */
class Evaluator {
  private readonly s: string;
  private pos = 0;

  constructor(s: string) {
    this.s = s;
  }

  parseExprToEnd(): number | null {
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

  private expr(): number | null {
    let value = this.term();
    if (value === null) return null;
    for (;;) {
      const ch = this.peek();
      if (ch === '+') {
        this.pos++;
        const rhs = this.term();
        if (rhs === null) return null;
        value += rhs;
      } else if (ch === '-') {
        this.pos++;
        const rhs = this.term();
        if (rhs === null) return null;
        value -= rhs;
      } else {
        return value;
      }
    }
  }

  private term(): number | null {
    let value = this.factor();
    if (value === null) return null;
    for (;;) {
      const ch = this.peek();
      if (ch === '*') {
        this.pos++;
        const rhs = this.factor();
        if (rhs === null) return null;
        value *= rhs;
      } else if (ch === '/') {
        this.pos++;
        const divisor = this.factor();
        if (divisor === null || divisor === 0) return null;
        value /= divisor;
      } else {
        return value;
      }
    }
  }

  private factor(): number | null {
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
      return value === null ? null : -value;
    }
    return this.numberWithUnit();
  }

  private numberWithUnit(): number | null {
    this.skipWs();
    const start = this.pos;
    while (this.pos < this.s.length && (/[0-9]/.test(this.s[this.pos]!) || this.s[this.pos] === '.')) this.pos++;
    if (this.pos === start) return null;
    const n = Number(this.s.slice(start, this.pos));
    if (!Number.isFinite(n)) return null;

    const unitStart = this.pos;
    while (this.pos < this.s.length && /[a-zA-Z]/.test(this.s[this.pos]!)) this.pos++;
    const unit = this.s.slice(unitStart, this.pos);
    switch (unit) {
      case '':
        return n;
      case 'px':
        return n;
      case 'rem':
        return n * 16;
      default:
        return null;
    }
  }
}
