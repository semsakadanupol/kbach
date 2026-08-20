import { describe, it, expect } from 'vitest';
import { parsePercentRelativeCalc, resolvePercentRelativeCalc } from './layoutCalc';

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

  it('returns null for multiple percentage terms', () => {
    expect(parsePercentRelativeCalc('w-[calc(100%_-_50%)]')).toBeNull();
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
