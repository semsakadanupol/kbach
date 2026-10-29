import { describe, it, expect } from 'vitest';
import { describeToken } from './engine';
import { parseColorFromText } from './colorValue';

/**
 * The actual real path the color provider exercises end-to-end — the
 * exact gap unit-testing colorValue.ts in isolation against a HAND-
 * WRITTEN fixture string missed: the fixture has to actually match what
 * the real engine produces, and it didn't until this test (and the real
 * bug) were found live.
 */
describe('describeToken + parseColorFromText (color provider\'s real path)', () => {
  it('resolves a plain named color to a usable RGBA', () => {
    // #3b82f6 — this package's own real generatedPalette.ts, not a
    // one-off theme override (the mistake this exact test caught: an
    // earlier version hand-copied the hex from an unrelated manual
    // sanity check that used a different, made-up theme).
    expect(parseColorFromText(describeToken('bg-blue-6')!)).toEqual({ r: 59, g: 130, b: 246, a: 1 });
  });

  it('resolves an explicit-opacity color to a usable RGBA with the real alpha', () => {
    expect(parseColorFromText(describeToken('bg-blue-6/50')!)).toEqual({ r: 59, g: 130, b: 246, a: 0.5 });
  });

  it('resolves an arbitrary hex color', () => {
    expect(parseColorFromText(describeToken('text-[#dddfff]')!)).toEqual({ r: 221, g: 223, b: 255, a: 1 });
  });
});
