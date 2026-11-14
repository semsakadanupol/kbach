import { describe, it, expect } from 'vitest';
import { scanClassTokens, splitRespectingBrackets } from './scanTokens';

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

  it('skips compared strings in a clsx() call, keeping offsets of the real classes', () => {
    // Regression: 'diff', 'add' and 'code' were underlined as unknown classes.
    const code = "clsx('px-5', lang === 'diff' && type === \"add\" && 'bg-green-6/10', tone !== 'code' ? 'a-1' : 'b-2')";
    const tokens = scanClassTokens(code);
    expect(tokens.map((t) => t.token)).toEqual(['px-5', 'bg-green-6/10', 'a-1', 'b-2']);
    for (const t of tokens) expect(code.slice(t.start, t.end)).toBe(t.token);
  });

  it('ignores className/clsx examples inside comments, keeping offsets of real code after them', () => {
    const code = [
      '// e.g. clsx(lang === x && "diff-in-line-comment")',
      '/* <div className="in-block-comment" /> */',
      'const url = "https://example.com"; <div className="flex p-4" />',
    ].join('\n');
    const tokens = scanClassTokens(code);
    expect(tokens.map((t) => t.token)).toEqual(['flex', 'p-4']);
    for (const t of tokens) expect(code.slice(t.start, t.end)).toBe(t.token);
  });

  it('ignores a className attribute written inside a JS string, but not after an apostrophe in JSX text', () => {
    const code = [
      "const fixture = '<div className=\"sample-in-string\" />';",
      "<p>Don't <b className=\"flex\">x</b></p>",
      '<p className="p-4" />',
    ].join('\n');
    expect(scanClassTokens(code).map((t) => t.token)).toEqual(['flex', 'p-4']);
  });

  it('ignores a composer call written inside a string', () => {
    // Regression: the "call" ran on into the following lines, flagging prose.
    const code = "const sample = 'see clsx(';\nit('handles multiple className attributes', () => {});\n<div className=\"flex\" />";
    expect(scanClassTokens(code).map((t) => t.token)).toEqual(['flex']);
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

describe('splitRespectingBrackets', () => {
  it('splits modifiers from the base on top-level colons only', () => {
    expect(splitRespectingBrackets('dark:hover:bg-blue-6')).toEqual(['dark', 'hover', 'bg-blue-6']);
    expect(splitRespectingBrackets('sm:bg-[url(a:b)]')).toEqual(['sm', 'bg-[url(a:b)]']);
    expect(splitRespectingBrackets('flex')).toEqual(['flex']);
    // the `:` of a type hint in the variable shorthand is not a separator
    expect(splitRespectingBrackets('hover:text-(length:--size)')).toEqual(['hover', 'text-(length:--size)']);
    expect(splitRespectingBrackets('supports-(--x):shadow-(color:--c)')).toEqual(['supports-(--x)', 'shadow-(color:--c)']);
  });
});
