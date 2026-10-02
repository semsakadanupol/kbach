import { describe, it, expect } from 'vitest';
import { scanClassTokens } from './scanTokens';

function tokenAt(code: string, match: { start: number; end: number }): string {
  return code.slice(match.start, match.end);
}

describe('scanClassTokens', () => {
  it('finds every token in a className string attribute, at the correct offsets', () => {
    const code = `<div className="flex p-4" />`;
    const matches = scanClassTokens(code);
    expect(matches.map((m) => m.token)).toEqual(['flex', 'p-4']);
    for (const m of matches) {
      expect(tokenAt(code, m)).toBe(m.token);
    }
  });

  it('reports the correct offsets when the attribute is NOT at the start of the string', () => {
    const code = `const x = 1;\n<div className="flex items-center" />`;
    const matches = scanClassTokens(code);
    expect(matches.map((m) => m.token)).toEqual(['flex', 'items-center']);
    for (const m of matches) {
      expect(tokenAt(code, m)).toBe(m.token);
    }
  });

  it('finds tokens inside a kb="..." attribute', () => {
    const code = `<div kb="bg-blue-6" />`;
    const matches = scanClassTokens(code);
    expect(matches.map((m) => m.token)).toEqual(['bg-blue-6']);
    expect(tokenAt(code, matches[0]!)).toBe('bg-blue-6');
  });

  it('finds tokens inside clsx()/cn()/kb() call arguments, at the correct offsets', () => {
    const code = `clsx('flex', isActive && 'p-4')`;
    const matches = scanClassTokens(code);
    expect(matches.map((m) => m.token)).toEqual(['flex', 'p-4']);
    for (const m of matches) {
      expect(tokenAt(code, m)).toBe(m.token);
    }
  });

  it('does NOT scan a template literal (the backtick catch-all is deliberately excluded)', () => {
    // The whole point of scoping this narrower than the build-time
    // scanner — see this file's own top doc comment.
    const code = '<h2>{`kb() — runtime-assembled class strings`}</h2>';
    expect(scanClassTokens(code)).toEqual([]);
  });

  it('does not hang on a huge never-closing composer call', () => {
    const code = `cn(${'('.repeat(200_000)}`;
    expect(() => scanClassTokens(code)).not.toThrow();
    expect(scanClassTokens(code)).toEqual([]);
  });

  it('handles multiple className attributes on the same line with correct offsets', () => {
    const code = `<a className="p-4" /><b className="flex" />`;
    const matches = scanClassTokens(code);
    expect(matches.map((m) => m.token)).toEqual(['p-4', 'flex']);
    for (const m of matches) {
      expect(tokenAt(code, m)).toBe(m.token);
    }
  });
});
