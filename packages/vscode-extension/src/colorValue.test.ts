import { describe, it, expect } from 'vitest';
import { parseColorFromText, formatColor } from './colorValue';

describe('parseColorFromText', () => {
  it('parses a 6-digit hex', () => {
    expect(parseColorFromText('background-color: #2563eb')).toEqual({ r: 37, g: 99, b: 235, a: 1 });
  });

  it('parses a 3-digit shorthand hex', () => {
    expect(parseColorFromText('color: #f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('parses an 8-digit hex with alpha', () => {
    expect(parseColorFromText('#2563eb80')).toEqual({ r: 37, g: 99, b: 235, a: expect.closeTo(0.502, 2) });
  });

  it('parses an rgba() value', () => {
    expect(parseColorFromText('background-color: rgba(59,130,246,0.5)')).toEqual({ r: 59, g: 130, b: 246, a: 0.5 });
  });

  it('parses a plain rgb() value with implicit full opacity', () => {
    expect(parseColorFromText('rgb(59,130,246)')).toEqual({ r: 59, g: 130, b: 246, a: 1 });
  });

  it('defaults alpha to 1 for the engine\'s real opacity-composition shape', () => {
    // Regression test for a real, confirmed bug: EVERY bg-/text-/
    // border-/etc. color this engine resolves composes opacity via a CSS
    // custom property fallback, confirmed live —
    // generate_css('bg-blue-6', ...) produces exactly this string, not a
    // plain numeric 4th component. The original `[\d.]+`-only regex
    // failed the WHOLE match on this shape (not just the alpha group),
    // silently producing zero color decorations for nearly every real
    // color class in the extension.
    expect(parseColorFromText('background-color: rgba(37,99,235,var(--bg-opacity, 1))')).toEqual({
      r: 37,
      g: 99,
      b: 235,
      a: 1,
    });
  });

  it('parses a REAL numeric alpha when explicit opacity was actually applied', () => {
    // Confirmed live: generate_css('bg-blue-6/50', ...) produces exactly
    // this shape — a real numeric 4th component, not the var() form —
    // so this must keep taking priority over the var()-defaults-to-1 case.
    expect(parseColorFromText('background-color: rgba(37,99,235,0.5)')).toEqual({ r: 37, g: 99, b: 235, a: 0.5 });
  });

  it('returns null for a non-color declaration', () => {
    expect(parseColorFromText('padding: 16px')).toBeNull();
  });
});

describe('formatColor', () => {
  it('formats a fully opaque color as hex', () => {
    expect(formatColor({ r: 37, g: 99, b: 235, a: 1 })).toBe('#2563eb');
  });

  it('formats a translucent color as rgba()', () => {
    expect(formatColor({ r: 59, g: 130, b: 246, a: 0.5 })).toBe('rgba(59,130,246,0.5)');
  });

  it('round-trips through parse -> format for a hex color', () => {
    const parsed = parseColorFromText('#ff6b35')!;
    expect(formatColor(parsed)).toBe('#ff6b35');
  });
});
