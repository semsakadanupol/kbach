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

export function scanClassTokens(code: string): TokenMatch[] {
  const found: TokenMatch[] = [];

  let m: RegExpExecArray | null;
  SIMPLE_ATTR_RE.lastIndex = 0;
  while ((m = SIMPLE_ATTR_RE.exec(code)) !== null) {
    // The opening quote is the first occurrence of the captured quote
    // character in the whole match (`className="` or `kb='`) — content
    // starts exactly one character after it.
    const contentStart = m.index + m[0].indexOf(m[1]!) + 1;
    found.push(...splitTokensWithOffsets(m[2]!, contentStart));
  }

  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(code)) !== null) {
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
        const contentStart = blockStart + qm.index + 1;
        found.push(...splitTokensWithOffsets(qm[2]!, contentStart));
      }
    }
    CALL_RE.lastIndex = i + 1;
  }

  return found;
}
