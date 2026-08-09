import { describe, it, expect } from 'vitest';
import { resolveSpacing, resolveSizing } from './spacing';

// Regression coverage for a fixed bug: negating an arbitrary value that was
// ALREADY negative (e.g. `-mt-[-10px]`) used to fall through every branch
// and return the value unchanged (still "-10px") instead of flipping it back
// to positive, silently leaving the margin negative when the class asked to
// negate it.

const spacing = { 4: 16, auto: 'auto', full: '100%' };

describe('resolveSpacing — arbitrary values', () => {
  it('flips an already-negative arbitrary value back to positive', () => {
    expect(resolveSpacing('-10px', true, spacing, true)).toBe('10px');
  });

  it('negates a positive arbitrary value as before', () => {
    expect(resolveSpacing('10px', true, spacing, true)).toBe('-10px');
  });

  it('leaves a positive arbitrary value alone when not negated', () => {
    expect(resolveSpacing('10px', false, spacing, true)).toBe('10px');
  });

  it('wraps a calc()/var()-style arbitrary value instead of string-prefixing it', () => {
    expect(resolveSpacing('calc(100% - 10px)', true, spacing, true)).toBe('calc(-1 * (calc(100% - 10px)))');
  });

  it('double-negating a calc() wrap does not un-negate it (each call negates independently)', () => {
    const once = resolveSpacing('calc(100% - 10px)', true, spacing, true) as string;
    // Feeding the already-wrapped result back through with negative:true wraps again —
    // resolveSpacing has no memory of a prior call, by design (pure function).
    expect(resolveSpacing(once, true, spacing, true)).toBe(`calc(-1 * (${once}))`);
  });
});

describe('resolveSpacing — scale values (unaffected by the arbitrary-value fix)', () => {
  it('negates a numeric scale value', () => {
    expect(resolveSpacing('4', true, spacing, false)).toBe(-16);
    expect(resolveSpacing('4', false, spacing, false)).toBe(16);
  });

  it('leaves "auto" unaffected by the negative flag', () => {
    expect(resolveSpacing('auto', true, spacing, false)).toBe('auto');
  });

  it('returns null for an unknown scale key', () => {
    expect(resolveSpacing('not-a-key', false, spacing, false)).toBeNull();
  });

  it('negates a percentage scale value by prefixing "-" (e.g. -inset-full)', () => {
    expect(resolveSpacing('full', true, spacing, false)).toBe('-100%');
    expect(resolveSpacing('full', false, spacing, false)).toBe('100%');
  });
});

describe('resolveSizing', () => {
  it('resolves a numeric scale value as-is (no negation support — sizing is never negative)', () => {
    expect(resolveSizing('4', spacing, false)).toBe(16);
  });

  it('converts a fraction to a percentage', () => {
    expect(resolveSizing('1/2', spacing, false)).toBe('50.000000%');
    expect(resolveSizing('2/3', spacing, false)).toBe('66.666667%');
  });

  it('guards against division by zero in a fraction', () => {
    expect(resolveSizing('5/0', spacing, false)).toBeNull();
  });

  it('returns null for an unknown, non-fraction value', () => {
    expect(resolveSizing('not-a-key', spacing, false)).toBeNull();
  });

  it('passes an arbitrary value through as-is on web', () => {
    expect(resolveSizing('50vw', spacing, true)).toBe('50vw');
  });
});
