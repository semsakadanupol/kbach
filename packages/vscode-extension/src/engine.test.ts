import { describe, it, expect } from 'vitest';
import { isKnownToken, describeToken } from './engine';

describe('isKnownToken', () => {
  it('is true for a real static utility', () => {
    expect(isKnownToken('flex')).toBe(true);
    expect(isKnownToken('p-4')).toBe(true);
  });

  it('is true for a real color utility', () => {
    expect(isKnownToken('bg-blue-6')).toBe(true);
  });

  it('is false for an unknown/typo class', () => {
    expect(isKnownToken('p-4-typo')).toBe(false);
  });

  it('is false for Tailwind\'s shade scale instead of Kbach\'s (the single most likely agent mistake)', () => {
    expect(isKnownToken('bg-blue-500')).toBe(false);
  });

  it('is true for a modifier-prefixed class', () => {
    expect(isKnownToken('dark:bg-blue-6')).toBe(true);
    expect(isKnownToken('sm:flex')).toBe(true);
  });
});

describe('describeToken', () => {
  it('returns the plain declaration for an unwrapped utility', () => {
    expect(describeToken('p-4')).toBe('padding: 16px');
  });

  it('returns null for an unknown class', () => {
    expect(describeToken('p-4-typo')).toBeNull();
  });

  it('returns the inner declaration for a modifier-wrapped (nested) rule', () => {
    // Regression test: a $-anchored "strip the outer wrapper" regex
    // looked right but returned null for every modifier-wrapped rule,
    // since the actual end of the rule STRING is the wrapper's own
    // closing brace, not the declaration block's.
    const result = describeToken('dark:bg-blue-6');
    expect(result).not.toBeNull();
    expect(result).toContain('background-color');
  });
});
