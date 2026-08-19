import { describe, it, expect } from 'vitest';
import { reduceConstantMath } from './calc';

// Mirrors packages/core-engine/src/calc.rs's own test suite — see that
// file's doc comment for why this exists as a hand-ported parity subset.
describe('reduceConstantMath', () => {
  it('reduces simple px addition', () => {
    expect(reduceConstantMath('calc(16px+8px)')).toBe(24);
  });

  it('reduces with spaces around operators', () => {
    expect(reduceConstantMath('calc(16px + 8px)')).toBe(24);
  });

  it('reduces rem to px at the 16x convention', () => {
    expect(reduceConstantMath('calc(1rem+8px)')).toBe(24);
  });

  it('respects multiplication and division precedence', () => {
    expect(reduceConstantMath('calc(10px+2px*3)')).toBe(16);
    expect(reduceConstantMath('calc(20px/2-2px)')).toBe(8);
  });

  it('reduces a bare unitless scalar multiplier', () => {
    expect(reduceConstantMath('calc(1rem*2)')).toBe(32);
  });

  it('handles nested parens', () => {
    expect(reduceConstantMath('calc((16px+8px)*2)')).toBe(48);
  });

  it('fails to reduce a percentage operand', () => {
    expect(reduceConstantMath('calc(50%-0.5rem)')).toBeNull();
  });

  it('fails to reduce a viewport unit operand', () => {
    expect(reduceConstantMath('calc(10vw+8px)')).toBeNull();
  });

  it('fails to reduce a css variable operand', () => {
    expect(reduceConstantMath('calc(var(--x)+8px)')).toBeNull();
  });

  it('fails on division by zero', () => {
    expect(reduceConstantMath('calc(16px/0)')).toBeNull();
  });

  it('reduces clamp to the clamped constant', () => {
    expect(reduceConstantMath('clamp(1rem,2rem,3rem)')).toBe(32);
    expect(reduceConstantMath('clamp(1rem,0.5rem,3rem)')).toBe(16);
    expect(reduceConstantMath('clamp(1rem,5rem,3rem)')).toBe(48);
  });

  it('fails to reduce clamp with a percentage argument', () => {
    expect(reduceConstantMath('clamp(1rem,50%,3rem)')).toBeNull();
  });

  it('reduces min and max over constant arguments', () => {
    expect(reduceConstantMath('min(16px,1rem,2rem)')).toBe(16);
    expect(reduceConstantMath('max(16px,1rem,2rem)')).toBe(32);
  });

  it('reduces min/max with more than three arguments', () => {
    expect(reduceConstantMath('min(40px,10px,20px,30px)')).toBe(10);
  });

  it('returns null for a plain non-math value', () => {
    expect(reduceConstantMath('16px')).toBeNull();
    expect(reduceConstantMath('50%')).toBeNull();
  });

  it('returns null for malformed calc syntax', () => {
    expect(reduceConstantMath('calc(16px+)')).toBeNull();
    expect(reduceConstantMath('calc(16px+8px')).toBeNull();
  });
});
