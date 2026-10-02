/**
 * Decides whether offering className completions at the cursor makes
 * sense at all — a much lower-stakes question than `scanTokens.ts`'s
 * diagnostic scanning: a false positive here just means completions pop
 * up somewhere unhelpful (dismissed by typing anything else), never a
 * visible, misleading error marker. So this is deliberately a looser
 * heuristic, bounded to a lookback window for cost, not a real parser.
 */

const LOOKBACK_LIMIT = 2000;
const CALL_NAME_LOOKBACK = 80;

const ATTR_BEFORE_QUOTE_RE = /\b(?:className|kb)\s*=\s*$/;
const CALL_NAME_RE = /\b(?:clsx|cn|classnames|cx|kb)\(/;

/** `textBeforeCursor` should be the document text up to (not including) the cursor offset. */
export function isInsideClassNameContext(textBeforeCursor: string): boolean {
  const window = textBeforeCursor.slice(Math.max(0, textBeforeCursor.length - LOOKBACK_LIMIT));

  let quote: string | null = null;
  let quoteStart = -1;
  for (let i = 0; i < window.length; i++) {
    const ch = window[i];
    if (ch === '\\' && quote !== null) {
      i++; // Skip the escaped character — an escaped quote never closes the string.
      continue;
    }
    if (quote === null && (ch === '"' || ch === "'" || ch === '`')) {
      quote = ch;
      quoteStart = i;
    } else if (ch === quote) {
      quote = null;
    }
  }

  if (quote === null) return false; // Not currently inside an open string at the cursor.

  const beforeQuote = window.slice(0, quoteStart);
  if (ATTR_BEFORE_QUOTE_RE.test(beforeQuote)) return true;

  const nearWindow = beforeQuote.slice(Math.max(0, beforeQuote.length - CALL_NAME_LOOKBACK));
  return CALL_NAME_RE.test(nearWindow);
}
