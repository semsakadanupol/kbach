import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseClass, parseClasses, splitClassTokens, normalizeClassString } from './parser';

// parser.ts derives modifiers/prefixes/standalone names from registry.ts and
// utilities.ts (the real resolver maps), so these tests exercise the actual
// built-in vocabulary (documented in KBACH.md) rather than a mocked one.

describe('parseClass', () => {
  it('parses a plain utility with a scale value', () => {
    expect(parseClass('p-4')).toEqual({
      original: 'p-4', modifiers: [], negative: false, important: false,
      utility: 'p', value: '4', isArbitrary: false,
    });
  });

  it('parses a color utility with a family-shade value', () => {
    const parsed = parseClass('bg-blue-6');
    expect(parsed).toMatchObject({ utility: 'bg', value: 'blue-6', isArbitrary: false });
  });

  it('recognises standalone utilities (no value)', () => {
    expect(parseClass('hidden')).toEqual({
      original: 'hidden', modifiers: [], negative: false, important: false,
      utility: 'hidden', value: '', isArbitrary: false,
    });
    expect(parseClass('flex')).toMatchObject({ utility: 'flex', value: '' });
  });

  describe('modifiers', () => {
    it('extracts a single modifier', () => {
      expect(parseClass('dark:bg-blue-6')).toMatchObject({
        modifiers: ['dark'], utility: 'bg', value: 'blue-6',
      });
    });

    it('extracts multiple chained modifiers in source order', () => {
      expect(parseClass('sm:dark:hover:bg-blue-6')).toMatchObject({
        modifiers: ['sm', 'dark', 'hover'], utility: 'bg', value: 'blue-6',
      });
    });

    it('does not require a hard cap on modifier count', () => {
      const parsed = parseClass('sm:dark:hover:focus:bg-blue-6');
      expect(parsed?.modifiers).toEqual(['sm', 'dark', 'hover', 'focus']);
    });

    it('leaves an unrecognised leading segment as part of the utility (not a modifier)', () => {
      // 'notamodifier' isn't a known modifier name, so the colon search must
      // stop there rather than silently swallowing it.
      const parsed = parseClass('notamodifier:bg-blue-6');
      expect(parsed?.modifiers).toEqual([]);
    });
  });

  describe('important prefix', () => {
    it('strips a leading "!"', () => {
      expect(parseClass('!p-4')).toMatchObject({ important: true, utility: 'p', value: '4' });
    });

    it('applies after modifier extraction', () => {
      expect(parseClass('dark:!bg-blue-6')).toMatchObject({
        modifiers: ['dark'], important: true, utility: 'bg', value: 'blue-6',
      });
    });
  });

  describe('negative prefix', () => {
    it('strips a leading "-" from a scale utility', () => {
      expect(parseClass('-mt-4')).toMatchObject({ negative: true, utility: 'mt', value: '4' });
    });

    it('does not treat "--" as a negative prefix', () => {
      // Guarded explicitly in parser.ts (remaining[1] !== '-') so a string
      // starting with two dashes isn't half-stripped into a single dash.
      const parsed = parseClass('--foo-4');
      expect(parsed?.negative).toBe(false);
    });

    it('applies after important extraction, before arbitrary-value extraction', () => {
      expect(parseClass('!-mt-4')).toMatchObject({ important: true, negative: true, utility: 'mt', value: '4' });
    });
  });

  describe('arbitrary values', () => {
    it('extracts a bracketed value', () => {
      expect(parseClass('bg-[#ff0000]')).toMatchObject({
        utility: 'bg', value: '#ff0000', isArbitrary: true,
      });
    });

    it('handles nested parens inside the bracket', () => {
      expect(parseClass('w-[calc(100%-2rem)]')).toMatchObject({
        utility: 'w', value: 'calc(100%-2rem)', isArbitrary: true,
      });
    });

    it('converts underscores to spaces (HTML className cannot contain raw spaces)', () => {
      expect(parseClass('grid-cols-[1fr_2fr_1fr]')).toMatchObject({
        utility: 'grid-cols', value: '1fr 2fr 1fr', isArbitrary: true,
      });
    });

    it('combines with the negative prefix', () => {
      expect(parseClass('-mt-[10px]')).toMatchObject({
        negative: true, utility: 'mt', value: '10px', isArbitrary: true,
      });
    });

    it('parses a bare "-[value]" (negative prefix with no utility name) as utility ""', () => {
      // Documented edge case in parser.ts: the negative-prefix step already
      // consumed the leading "-", so what's left is a bracket with nothing
      // before it — must NOT fall through to the first-dash-split fallback.
      expect(parseClass('-[10px]')).toEqual({
        original: '-[10px]', modifiers: [], negative: true, important: false,
        utility: '', value: '10px', isArbitrary: true,
      });
    });

    it('does not mistake a colon inside brackets for a modifier separator', () => {
      const parsed = parseClass('hover:bg-[url(http://example.com/x.png)]');
      expect(parsed).toMatchObject({
        modifiers: ['hover'], utility: 'bg', value: 'url(http://example.com/x.png)', isArbitrary: true,
      });
    });
  });

  describe('unsafe arbitrary values are rejected outright', () => {
    let warnSpy: any;
    beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { warnSpy.mockRestore(); });

    it.each([
      ['bg-[red;color:blue]', 'semicolon (declaration smuggling)'],
      ['bg-[{color:blue}]', 'curly brace (rule breakout)'],
      ['bg-[a/*b*/c]', 'comment delimiters'],
      ['bg-[a\\62]', 'backslash (CSS numeric escape)'],
    ])('rejects %s — %s', (cls) => {
      expect(parseClass(cls)).toBeNull();
    });

    it('warns exactly once per rejected value', () => {
      parseClass('bg-[a;b]');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('malformed brackets', () => {
    it('falls back to greedy prefix matching when the bracket never closes', () => {
      // No matching "]" — bracketStart stays -1, so this is NOT treated as an
      // arbitrary value. It still resolves via the normal 'bg-' prefix match,
      // just with a literal "[foo" as the value (which will fail to resolve
      // a real color and get silently skipped upstream in resolver.ts).
      expect(parseClass('bg-[foo')).toMatchObject({ utility: 'bg', value: '[foo', isArbitrary: false });
    });
  });

  describe('fallback parsing', () => {
    it('splits an unrecognised token on the first dash', () => {
      expect(parseClass('foo-bar')).toEqual({
        original: 'foo-bar', modifiers: [], negative: false, important: false,
        utility: 'foo', value: 'bar', isArbitrary: false,
      });
    });

    it('treats a dashless unrecognised token as a valueless utility', () => {
      expect(parseClass('xyz')).toEqual({
        original: 'xyz', modifiers: [], negative: false, important: false,
        utility: 'xyz', value: '', isArbitrary: false,
      });
    });
  });

  it('returns null for an empty or whitespace-only string', () => {
    expect(parseClass('')).toBeNull();
    expect(parseClass('   ')).toBeNull();
  });
});

describe('splitClassTokens', () => {
  it('splits on whitespace', () => {
    expect(splitClassTokens('p-4 bg-blue-6 rounded')).toEqual(['p-4', 'bg-blue-6', 'rounded']);
  });

  it('strips whitespace inside brackets so arbitrary values stay one token', () => {
    expect(splitClassTokens('bg-[rgb(41, 172, 15)] p-4')).toEqual(['bg-[rgb(41,172,15)]', 'p-4']);
  });

  it('strips whitespace inside parens outside of brackets too', () => {
    expect(splitClassTokens('will-change-[transform,_opacity]')).toEqual(['will-change-[transform,_opacity]']);
  });

  it('collapses repeated whitespace between tokens', () => {
    expect(splitClassTokens('p-4    bg-blue-6')).toEqual(['p-4', 'bg-blue-6']);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitClassTokens('')).toEqual([]);
  });
});

describe('normalizeClassString', () => {
  it('re-joins stripped tokens with single spaces', () => {
    expect(normalizeClassString('bg-[rgb(41, 172, 15)]   p-4')).toBe('bg-[rgb(41,172,15)] p-4');
  });
});

describe('parseClasses', () => {
  it('parses every token in a class string', () => {
    const parsed = parseClasses('p-4 dark:bg-blue-6 hidden');
    expect(parsed.map((p) => p.utility)).toEqual(['p', 'bg', 'hidden']);
  });

  it('silently drops tokens that fail to parse (e.g. rejected unsafe arbitrary values)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseClasses('p-4 bg-[a;b] rounded');
    warnSpy.mockRestore();
    expect(parsed.map((p) => p.utility)).toEqual(['p', 'rounded']);
  });

  it('returns an empty array for an empty class string', () => {
    expect(parseClasses('')).toEqual([]);
  });
});
