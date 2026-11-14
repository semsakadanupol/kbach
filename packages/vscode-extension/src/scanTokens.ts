/**
 * Finds every candidate class token in a document, WITH its absolute
 * character offset, for diagnostics to anchor a range to — the one thing
 * `@kbach/react`'s own build-time scanner (`vite-plugin/scan.ts`) never
 * needed, since it only ever checked SET membership, not position.
 *
 * Deliberately narrower than that scanner: only `className="..."` /
 * `kb="..."` literal-string attributes, and `clsx(/cn(/kb(/classnames(/cx(`
 * call arguments' QUOTED string literals — no backtick-template-literal
 * catch-all. That catch-all is exactly what caused real false-positive
 * "Unknown class" warnings on plain prose earlier in this project's own
 * history (see packages/react/src/vite-plugin/scan.ts's own doc comments
 * on `isJsxExpressionChildTemplateLiteral`/`hasUnbracketedParen`) — a
 * missed dynamic class there just means the BUILD doesn't statically see
 * it (safe default: still resolves fine via runtime `kb()`), but a false
 * positive HERE is a live, in-your-face squiggly underline on text that
 * was never a class at all. Erring conservative is the right trade in an
 * editor diagnostic, the opposite of the build-time scanner's own
 * reasoning.
 */

export interface TokenMatch {
  token: string;
  start: number;
  end: number;
}

function splitTokensWithOffsets(str: string, baseOffset: number): TokenMatch[] {
  const matches: TokenMatch[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    matches.push({ token: m[0], start: baseOffset + m.index, end: baseOffset + m.index + m[0].length });
  }
  return matches;
}

const SIMPLE_ATTR_RE = /(?:className|kb)=(["'])((?:(?!\1).)*)\1/g;
const CALL_RE = /\b(?:clsx|cn|classnames|cx|kb)\(/g;
const QUOTED_STRING_RE = /(["'])((?:(?!\1).)*)\1/g;

const MAX_BLOCK_SCAN_LEN = 20_000;

/**
 * `code` with every `//` and `/* *\/` comment replaced by spaces (newlines
 * kept), so offsets still line up with the document. A `clsx('…')` example
 * written in a comment used to be checked like real code. Strings are
 * skipped over, so a "//" inside one (a URL) isn't taken for a comment.
 */
function blankComments(code: string): { code: string; strings: [number, number][] } {
  const out = code.split('');
  const strings: [number, number][] = [];
  const n = code.length;
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  while (i < n) {
    const ch = code[i]!;
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      const end = code.indexOf('\n', i);
      blank(i, end === -1 ? n : end);
      i = end === -1 ? n : end;
    } else if (ch === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const start = i;
      i++;
      // '…' and "…" end at the line's end: an apostrophe in JSX text
      // (<p>Don't</p>) isn't a string, and mustn't swallow the code after it.
      while (i < n && code[i] !== ch && (ch === '`' || code[i] !== '\n')) i += code[i] === '\\' ? 2 : 1;
      if (i < n && code[i] === ch) {
        i++;
        strings.push([start, i]);
      } else {
        i = start + 1; // unterminated on its line: not a string
      }
    } else {
      i++;
    }
  }
  return { code: out.join(''), strings };
}

/** Whether `offset` falls inside one of the (sorted) string ranges. */
function insideString(strings: [number, number][], offset: number): boolean {
  let lo = 0;
  let hi = strings.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e] = strings[mid]!;
    if (offset < s) hi = mid - 1;
    else if (offset >= e) lo = mid + 1;
    else return true;
  }
  return false;
}

// A string on either side of a comparison is a value being tested, not a
// class: in `clsx(lang === 'diff' && 'bg-green-6/10')` only the second
// string is classes (same rule as @kbach/react's build-time scanner).
const COMPARED_BEFORE_RE = /[=!]==?\s*$/;
const COMPARED_AFTER_RE = /^\s*[=!]==?/;

export function scanClassTokens(rawCode: string): TokenMatch[] {
  const { code, strings } = blankComments(rawCode);
  const found: TokenMatch[] = [];

  let m: RegExpExecArray | null;
  SIMPLE_ATTR_RE.lastIndex = 0;
  while ((m = SIMPLE_ATTR_RE.exec(code)) !== null) {
    // `'<div className="x" />'` written inside a JS string (a test fixture,
    // a code sample) is text, not JSX.
    if (insideString(strings, m.index)) continue;
    // The opening quote is the first occurrence of the captured quote
    // character in the whole match (`className="` or `kb='`) — content
    // starts exactly one character after it.
    const contentStart = m.index + m[0].indexOf(m[1]!) + 1;
    found.push(...splitTokensWithOffsets(m[2]!, contentStart));
  }

  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(code)) !== null) {
    // A real call is never inside quotes: `cn(` in a string (a test
    // fixture, a message) used to start a "call" that ran into the code
    // after it, flagging every word there.
    if (insideString(strings, m.index)) continue;
    let depth = 1;
    let i = m.index + m[0].length;
    const scanEnd = Math.min(code.length, i + MAX_BLOCK_SCAN_LEN);
    const blockStart = i;
    while (i < scanEnd && depth > 0) {
      const ch = code[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (--depth === 0) break;
      }
      i++;
    }
    if (depth === 0) {
      const block = code.slice(blockStart, i);
      QUOTED_STRING_RE.lastIndex = 0;
      let qm: RegExpExecArray | null;
      while ((qm = QUOTED_STRING_RE.exec(block)) !== null) {
        const before = block.slice(Math.max(0, qm.index - 4), qm.index);
        const after = block.slice(qm.index + qm[0].length, qm.index + qm[0].length + 4);
        if (COMPARED_BEFORE_RE.test(before) || COMPARED_AFTER_RE.test(after)) continue;
        const contentStart = blockStart + qm.index + 1;
        found.push(...splitTokensWithOffsets(qm[2]!, contentStart));
      }
    }
    CALL_RE.lastIndex = i + 1;
  }

  return found;
}

/**
 * Splits a single class token on ':' outside `[...]` brackets — modifier
 * segments first, the base utility last (`dark:bg-[url(a:b)]` ->
 * `['dark', 'bg-[url(a:b)]']`). Parentheses count too, as in the engine's
 * own parser: the `:` of `text-(length:--size)` is a type hint, not a
 * modifier separator. The ONE copy every TypeScript caller in
 * this package uses (`colorToken.ts`, `nativeUnsupported.ts`), so the
 * color decorator and the native-unsupported diagnostic can never split
 * the same token two different ways. `scripts/generate-vocabulary.mjs`
 * keeps its own plain-JS copy only because it runs as a standalone Node
 * script, before any TypeScript build — keep it in sync with this one.
 */
export function splitRespectingBrackets(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth++;
    else if (ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ':' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}
