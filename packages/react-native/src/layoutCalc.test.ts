import { describe, it, expect } from 'vitest';
import { parsePercentRelativeCalc, parsePercentRelativeExpr, resolvePercentRelativeCalc } from './layoutCalc';

describe('parsePercentRelativeCalc', () => {
  it('parses "percent% - constant" on width', () => {
    const parsed = parsePercentRelativeCalc('w-[calc(100%_-_3rem)]');
    expect(parsed).toEqual({ property: 'width', percentCoefficient: 100, constantPx: -48 });
  });

  it('parses "percent% + constant" on height', () => {
    const parsed = parsePercentRelativeCalc('h-[calc(50%_+_16px)]');
    expect(parsed).toEqual({ property: 'height', percentCoefficient: 50, constantPx: 16 });
  });

  it('parses "constant - percent%"', () => {
    const parsed = parsePercentRelativeCalc('w-[calc(3rem_-_100%)]');
    expect(parsed).toEqual({ property: 'width', percentCoefficient: -100, constantPx: 48 });
  });

  it('parses "constant + percent%"', () => {
    const parsed = parsePercentRelativeCalc('w-[calc(16px_+_50%)]');
    expect(parsed).toEqual({ property: 'width', percentCoefficient: 50, constantPx: 16 });
  });

  it('accepts a genuine literal space too (once already normalized from underscores upstream, or if the token itself never had underscores)', () => {
    const parsed = parsePercentRelativeCalc('w-[calc(100% - 3rem)]');
    expect(parsed).toEqual({ property: 'width', percentCoefficient: 100, constantPx: -48 });
  });

  it('returns null for a non-calc arbitrary value', () => {
    expect(parsePercentRelativeCalc('w-[240px]')).toBeNull();
  });

  it('returns null for a fully constant calc (handled by the existing constant-only reducer instead)', () => {
    expect(parsePercentRelativeCalc('w-[calc(16px_+_8px)]')).toBeNull();
  });

  it('returns null for a property other than width/height', () => {
    expect(parsePercentRelativeCalc('p-[calc(100%_-_3rem)]')).toBeNull();
  });

  it('combines multiple percentage terms into one coefficient (capability upgrade — used to return null)', () => {
    // 100% - 50% is a perfectly linear combination (50%), unlike the old
    // two-term-only parser which only ever understood ONE percent term.
    expect(parsePercentRelativeCalc('w-[calc(100%_-_50%)]')).toEqual({
      property: 'width',
      percentCoefficient: 50,
      constantPx: 0,
    });
  });

  it('resolves a percentage divided by a plain number (real Tailwind has no such scale, but real CSS calc() does)', () => {
    expect(parsePercentRelativeCalc('w-[calc(100%/2)]')).toEqual({
      property: 'width',
      percentCoefficient: 50,
      constantPx: 0,
    });
  });

  it('resolves a nested-parens expression mixing division and subtraction', () => {
    expect(parsePercentRelativeCalc('w-[calc((100%/2)-10px)]')).toEqual({
      property: 'width',
      percentCoefficient: 50,
      constantPx: -10,
    });
  });

  it('returns null for dividing by a percentage (not a linear operation)', () => {
    expect(parsePercentRelativeCalc('w-[calc(10px/50%)]')).toBeNull();
  });

  it('returns null for multiplying two percentages together (not a real CSS type)', () => {
    expect(parsePercentRelativeCalc('w-[calc(50%*50%)]')).toBeNull();
  });

  it('returns null for an unreducible constant term (viewport unit)', () => {
    expect(parsePercentRelativeCalc('w-[calc(100%_-_10vw)]')).toBeNull();
  });

  it('returns null for a plain percentage with no arithmetic', () => {
    expect(parsePercentRelativeCalc('w-[100%]')).toBeNull();
  });
});

describe('resolvePercentRelativeCalc', () => {
  it('computes "100% - 3rem" against a measured basis', () => {
    expect(resolvePercentRelativeCalc(390, { property: 'width', percentCoefficient: 100, constantPx: -48 })).toBe(342);
  });

  it('computes "50% + 16px" against a measured basis', () => {
    expect(resolvePercentRelativeCalc(400, { property: 'height', percentCoefficient: 50, constantPx: 16 })).toBe(216);
  });

  it('computes a negative percent coefficient ("3rem - 100%")', () => {
    expect(resolvePercentRelativeCalc(390, { property: 'width', percentCoefficient: -100, constantPx: 48 })).toBe(-342);
  });
});

// Regression coverage for a real gap: min()/max()/clamp() were documented
// (README's "Arbitrary math" section) alongside calc() as if all four had
// equal capability, but only calc() actually got the onLayout-measurement
// treatment for a percentage operand — min(50%,20rem) (a genuinely common,
// realistic use case: "half the parent, capped at a fixed size") silently
// dropped with a warning instead of resolving. parsePercentRelativeExpr is
// the fix — same all-or-nothing reduction philosophy as calc()'s own
// parser, extended to cover these three functions too.
describe('parsePercentRelativeExpr — min()/max()/clamp()', () => {
  it('still parses a plain calc() exactly like parsePercentRelativeCalc did (unchanged behavior)', () => {
    const expr = parsePercentRelativeExpr('w-[calc(100%_-_3rem)]');
    expect(expr?.property).toBe('width');
    expect(expr?.resolve(390)).toBe(342);
  });

  it('resolves min(percent, constant) — the parent width or a fixed cap, whichever is smaller', () => {
    const expr = parsePercentRelativeExpr('w-[min(50%,20rem)]');
    expect(expr?.property).toBe('width');
    // 50% of 500 = 250, vs a fixed 320 (20rem) — min is 250.
    expect(expr?.resolve(500)).toBe(250);
    // 50% of 1000 = 500, vs a fixed 320 — min is 320.
    expect(expr?.resolve(1000)).toBe(320);
  });

  it('resolves max(percent, constant) — a minimum readable size relative to the parent', () => {
    const expr = parsePercentRelativeExpr('h-[max(1rem,5%)]');
    expect(expr?.property).toBe('height');
    // 5% of 100 = 5, vs a fixed 16 (1rem) — max is 16.
    expect(expr?.resolve(100)).toBe(16);
    // 5% of 500 = 25, vs a fixed 16 — max is 25.
    expect(expr?.resolve(500)).toBe(25);
  });

  it('resolves clamp(min, preferred%, max) using real CSS clamp semantics', () => {
    const expr = parsePercentRelativeExpr('w-[clamp(16rem,50%,32rem)]');
    expect(expr?.property).toBe('width');
    // 50% of 400 = 200, below the 256px (16rem) floor — clamps up to 256.
    expect(expr?.resolve(400)).toBe(256);
    // 50% of 800 = 400, inside [256, 512] — passes through.
    expect(expr?.resolve(800)).toBe(400);
    // 50% of 2000 = 1000, above the 512px (32rem) ceiling — clamps down to 512.
    expect(expr?.resolve(2000)).toBe(512);
  });

  it('supports more than two arguments to min()/max()', () => {
    const expr = parsePercentRelativeExpr('w-[min(50%,20rem,15rem)]');
    // 50% of 1000 = 500, vs 320 (20rem), vs 240 (15rem) — min is 240.
    expect(expr?.resolve(1000)).toBe(240);
  });

  it('returns null (defers to reduceConstantMath) when min()/max() has no percentage at all', () => {
    expect(parsePercentRelativeExpr('w-[min(10px,20px)]')).toBeNull();
  });

  it('returns null for a property other than width/height', () => {
    expect(parsePercentRelativeExpr('p-[min(50%,20rem)]')).toBeNull();
  });

  it('returns null when clamp() is given the wrong number of arguments', () => {
    expect(parsePercentRelativeExpr('w-[clamp(50%,20rem)]')).toBeNull();
  });

  it('resolves an argument that mixes a percentage with arithmetic (capability upgrade — used to return null)', () => {
    const expr = parsePercentRelativeExpr('w-[min(50%_-_1rem,20rem)]');
    // 50% of 500 - 16 = 234, vs a fixed 320 (20rem) — min is 234.
    expect(expr?.resolve(500)).toBe(234);
  });

  it('returns null when an argument is unreducible (viewport unit)', () => {
    expect(parsePercentRelativeExpr('w-[min(50%,10vw)]')).toBeNull();
  });

  it('returns null for an ordinary non-calc/min/max/clamp arbitrary value', () => {
    expect(parsePercentRelativeExpr('w-[240px]')).toBeNull();
  });
});
