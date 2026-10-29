import { describe, it, expect } from 'vitest';
import { buildColorReplacement, isArbitraryColorToken } from './colorToken';

const RED: Parameters<typeof buildColorReplacement>[1] = { r: 255, g: 0, b: 0, a: 1 };
const TRANSLUCENT_BLUE = { r: 59, g: 130, b: 246, a: 0.5 };

describe('buildColorReplacement', () => {
  it('rewrites a plain color class to the arbitrary-value equivalent', () => {
    expect(buildColorReplacement('bg-blue-6', RED)).toBe('bg-[#ff0000]');
  });

  it('preserves a single modifier prefix', () => {
    expect(buildColorReplacement('dark:bg-blue-6', RED)).toBe('dark:bg-[#ff0000]');
  });

  it('preserves multiple chained modifiers in order', () => {
    expect(buildColorReplacement('sm:dark:text-red-8', RED)).toBe('sm:dark:text-[#ff0000]');
  });

  it('uses rgba() when the picked color has partial opacity', () => {
    expect(buildColorReplacement('border-blue-6', TRANSLUCENT_BLUE)).toBe('border-[rgba(59,130,246,0.5)]');
  });

  it('preserves the exact original color-utility prefix (not always "bg")', () => {
    expect(buildColorReplacement('ring-blue-6', RED)).toBe('ring-[#ff0000]');
    expect(buildColorReplacement('decoration-blue-6', RED)).toBe('decoration-[#ff0000]');
  });

  it('returns null for a token whose base is not a color utility', () => {
    expect(buildColorReplacement('p-4', RED)).toBeNull();
    expect(buildColorReplacement('dark:flex', RED)).toBeNull();
  });
});

describe('isArbitraryColorToken', () => {
  it('is true for an arbitrary bracket color value', () => {
    expect(isArbitraryColorToken('bg-[#ff0000]')).toBe(true);
    expect(isArbitraryColorToken('text-[rgba(0,0,0,0.5)]')).toBe(true);
  });

  it('is true for an arbitrary value with modifiers', () => {
    expect(isArbitraryColorToken('dark:sm:bg-[#ff0000]')).toBe(true);
  });

  it('is false for a named palette shade — these are picker-read-only by design', () => {
    expect(isArbitraryColorToken('bg-blue-6')).toBe(false);
    expect(isArbitraryColorToken('dark:text-emerald-8')).toBe(false);
  });

  it('is false for a named shade with an explicit opacity suffix', () => {
    expect(isArbitraryColorToken('border-blue-6/50')).toBe(false);
  });

  it('is false for a non-color token entirely', () => {
    expect(isArbitraryColorToken('p-4')).toBe(false);
    expect(isArbitraryColorToken('flex')).toBe(false);
  });
});
