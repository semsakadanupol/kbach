import { describe, it, expect } from 'vitest';
import { extractClassStrings, scanUsedTags } from './scan';

describe('extractClassStrings', () => {
  it('extracts a simple string className attribute', () => {
    const code = `<div className="bg-blue-6 p-4" />`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['bg-blue-6', 'p-4']));
  });

  it('extracts a simple string kb attribute', () => {
    const code = `<div kb="flex items-center" />`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['flex', 'items-center']));
  });

  it('extracts from a className expression block with a ternary', () => {
    const code = `<div className={isActive ? 'bg-blue-6' : 'bg-gray-9'} />`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['bg-blue-6', 'bg-gray-9']));
  });

  it('extracts static text and interpolated branches from a template literal', () => {
    const code = '<div className={`p-4 ${isActive ? "bg-blue-6" : "bg-gray-9"}`} />';
    const found = extractClassStrings(code);
    expect(found).toEqual(expect.arrayContaining(['p-4', 'bg-blue-6', 'bg-gray-9']));
  });

  it('extracts from a clsx() call', () => {
    const code = `clsx('bg-blue-6', isActive && 'p-4', { 'gap-4': hasGap })`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['bg-blue-6', 'p-4', 'gap-4']));
  });

  it('extracts from a cn() call', () => {
    const code = `cn('flex', 'items-center')`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['flex', 'items-center']));
  });

  it('extracts from a standalone kb() call assigned to a variable', () => {
    const code = `const styles = kb('bg-blue-6 rounded-lg');`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['bg-blue-6', 'rounded-lg']));
  });

  it('does not truncate a double-quoted attribute containing an apostrophe', () => {
    const code = `<div className="bg-[url('a.png')] p-4" />`;
    // The whole value is one token here since it contains no whitespace outside the url(); just
    // confirm it isn't split/truncated at the embedded single quote.
    const found = extractClassStrings(code);
    expect(found.some((t) => t.includes('a.png'))).toBe(true);
  });

  it('handles nested braces inside a className expression block', () => {
    const code = `<div className={cond ? styles.active : 'bg-blue-6'} />`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['bg-blue-6']));
  });

  it('does not include leftover interpolation punctuation as a class name', () => {
    const code = '<div className={`bg-${color}-6`} />';
    const found = extractClassStrings(code);
    expect(found.every((t) => !t.includes('${') && !t.includes('}'))).toBe(true);
  });

  it('returns no tokens for code with no class-like strings', () => {
    const code = `function add(a, b) { return a + b; }`;
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('does not tokenize a backtick span inside a line comment', () => {
    const code = "// try `flex items-center` for centering\nfunction add(a, b) { return a + b; }";
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('does not tokenize a backtick span inside a block comment', () => {
    const code = '/** @example <div className={`flex items-center`} /> */\nfunction add(a, b) { return a + b; }';
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('does not tokenize a commented-out className attribute', () => {
    const code = '// <div className="bg-blue-6 p-4" />\nconst x = 1;';
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('still extracts real classes on the line right after a comment containing a backtick span', () => {
    const code = "// try `flex items-center` for centering\n<div className=\"bg-blue-6\" />";
    expect(extractClassStrings(code)).toEqual(['bg-blue-6']);
  });

  it('does not treat "//" inside a real string as a comment start', () => {
    const code = `<a className="p-4" href="https://example.com">link</a>`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['p-4']));
  });

  it('does not match "kb(" or "cn(" as a tail-substring of a longer identifier', () => {
    const code = `const arkb=(x) => x; const reactCn=(x) => x; arkb('bg-blue-6'); reactCn('p-4');`;
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('still matches a real kb() call right after an unrelated identifier ending the same letters', () => {
    const code = `const arkb = 1; kb('bg-blue-6');`;
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['bg-blue-6']));
  });

  it('does not hang or blow the stack on a huge never-closing className expression block', () => {
    const code = `<div className={${'{'.repeat(200_000)}`;
    expect(() => extractClassStrings(code)).not.toThrow();
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('does not hang or blow the stack on a huge never-closing composer call', () => {
    const code = `cn(${'('.repeat(200_000)}`;
    expect(() => extractClassStrings(code)).not.toThrow();
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('does not extract a literal "kb()" substring living inside a real className attribute', () => {
    // No valid Kbach utility ever has a bare, unbracketed paren, so this is
    // safe to filter with zero false negatives for real arbitrary-value
    // syntax (see the next test).
    const code = `<div className="flex kb() items-center" />`;
    const found = extractClassStrings(code);
    expect(found).toEqual(expect.arrayContaining(['flex', 'items-center']));
    expect(found).not.toContain('kb()');
  });

  it('still extracts a real arbitrary value whose OWN parens are inside its OWN brackets', () => {
    const code = `<div className="w-[calc(50%-1rem)] bg-[rgb(255,0,0)]" />`;
    expect(extractClassStrings(code)).toEqual(
      expect.arrayContaining(['w-[calc(50%-1rem)]', 'bg-[rgb(255,0,0)]']),
    );
  });

  it('does not tokenize a template-literal JSX expression child as candidate classes', () => {
    // Reported live and confirmed: a heading's own display text written as
    // a template literal — `<h2>{\`kb() — runtime-assembled class
    // strings\`}</h2>` — has no className/kb attribute and no clsx()/kb()
    // call anywhere nearby, yet rule 4's catch-all "any backtick literal in
    // the file" scan (which exists to catch a template literal assigned to
    // a variable and spread into className some other way) doesn't know
    // that and unconditionally splits the whole string by whitespace,
    // producing "runtime-assembled", "strings", etc. as false-positive
    // candidates — each one then a spurious "Unknown class ... Typo?"
    // warning with nothing to fix. A template literal is JSX display text
    // (as opposed to assigned to a variable/passed to a call) if and only
    // if it's a `{`...`}` expression child with nothing else inside the
    // braces — the `>{` / `}<` shape this test's repro has exactly.
    const code = 'export function Demo() { return <h2>{`kb() — runtime-assembled class strings`}</h2>; }';
    expect(extractClassStrings(code)).toEqual([]);
  });

  it('still tokenizes a template literal assigned to a variable (the case rule 4 exists for)', () => {
    const code = "const styles = `bg-blue-6 rounded-lg`; el.className = styles;";
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['bg-blue-6', 'rounded-lg']));
  });

  it('still tokenizes a template literal inside className={...} (already covered by rule 2, harmless double-scan by rule 4)', () => {
    const code = '<div className={`p-4 ${isActive ? "bg-blue-6" : "bg-gray-9"}`} />';
    expect(extractClassStrings(code)).toEqual(expect.arrayContaining(['p-4', 'bg-blue-6', 'bg-gray-9']));
  });
});

describe('scanUsedTags', () => {
  it('collects lowercase intrinsic tag names from JSX', () => {
    const code = `<div><a href="/">link</a><button>go</button></div>`;
    expect(scanUsedTags(code)).toEqual(new Set(['div', 'a', 'button']));
  });

  it('detects self-closing tags', () => {
    const code = `<img src="x.png" /><input type="text" />`;
    const tags = scanUsedTags(code);
    expect(tags.has('img')).toBe(true);
    expect(tags.has('input')).toBe(true);
  });

  it('ignores capitalized component references', () => {
    const code = `<Section><ThemeProvider><Demo /></ThemeProvider></Section>`;
    const tags = scanUsedTags(code);
    expect(tags.size).toBe(0);
  });

  it('returns an empty set for code with no JSX tags at all', () => {
    expect(scanUsedTags(`function add(a, b) { return a + b; }`).size).toBe(0);
  });

  it('detects a bare tag with no attributes and no children', () => {
    expect(scanUsedTags(`<p>text</p>`).has('p')).toBe(true);
  });

  it('ignores a tag mentioned only inside a comment', () => {
    const code = '// <video src="x.mp4" />\nfunction add(a, b) { return a + b; }';
    expect(scanUsedTags(code).size).toBe(0);
  });
});
