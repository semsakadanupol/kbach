// Ported from old-kbach/src/vite-plugin.ts's extractClassStrings and its
// helpers — proven, already-bug-fixed string extraction (same-quote
// backreferences so an apostrophe inside a double-quoted attribute doesn't
// truncate it; brace/paren-depth tracking so a nested object/call doesn't
// stop the scan at the first `}`/`)`). Narrowed to this project's actual
// surface: no styled() scanning (this project has no styled() HOC).

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Strips `//` and `/* *­/` comments out of `code` before any extraction rule
 * below runs, WITHOUT touching string/template content (a "//" inside a URL
 * string must survive). Without this, a JSDoc example like
 * `` // try `flex items-center` for centering `` gets tokenized as two real
 * classes by the unconditional template-literal rule further down — this
 * pre-pass fixes that for every rule at once, not just that one, since a
 * commented-out `className="..."` attribute has the identical problem.
 *
 * Deliberately not a full JS/TS tokenizer: a template literal's `${...}`
 * interpolation is tracked only via brace depth (consistent with
 * `pushTemplateLiteralBody`'s own one-level nesting elsewhere in this
 * file), so a comment genuinely nested inside an interpolation's own
 * expression isn't stripped — a rare case, and failing to strip it there
 * only risks under-stripping, never the false-positive class extraction
 * this function exists to prevent.
 */
function stripComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;

  while (i < n) {
    const two = code[i]! + (code[i + 1] ?? '');

    if (two === '//') {
      i += 2;
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (two === '/*') {
      i += 2;
      while (i < n && code[i] + (code[i + 1] ?? '') !== '*/') i++;
      i += 2;
      continue;
    }

    const ch = code[i]!;
    if (ch === '"' || ch === "'") {
      out += ch;
      i++;
      while (i < n && code[i] !== ch) {
        if (code[i] === '\\') { out += code[i]! + (code[i + 1] ?? ''); i += 2; continue; }
        out += code[i];
        i++;
      }
      out += code[i] ?? '';
      i++;
      continue;
    }
    if (ch === '`') {
      out += ch;
      i++;
      let interpolationDepth = 0;
      while (i < n) {
        if (interpolationDepth === 0 && code[i] === '`') { out += code[i]; i++; break; }
        if (interpolationDepth === 0 && code[i] === '\\') { out += code[i]! + (code[i + 1] ?? ''); i += 2; continue; }
        if (interpolationDepth === 0 && code[i] + (code[i + 1] ?? '') === '${') {
          out += '${';
          i += 2;
          interpolationDepth = 1;
          continue;
        }
        if (interpolationDepth > 0) {
          if (code[i] === '{') interpolationDepth++;
          else if (code[i] === '}') {
            interpolationDepth--;
            if (interpolationDepth === 0) { out += '}'; i++; continue; }
          }
        }
        out += code[i];
        i++;
      }
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

function splitClassTokens(str: string): string[] {
  return str.split(/\s+/).filter(Boolean);
}

// Never a real class name, regardless of how it was extracted: leftover
// ${...} interpolation syntax the extraction couldn't fully resolve, the
// static remainder of a token whose other half was an interpolation
// ("nested-" from `` `nested-${size}` ``), or ternary/quote punctuation left
// over from a mismatched/partially-resolved expression. Negative-value
// utilities (`-mt-4`) legitimately start with "-", so only a TRAILING dash
// is filtered.
const NOT_A_CLASS_NAME_RE = /[${}]|-$|^[?:&|!"'=<>]+$/;

function pushTokens(str: string, into: Set<string>): void {
  for (const tok of splitClassTokens(str)) {
    if (tok && !NOT_A_CLASS_NAME_RE.test(tok)) into.add(tok);
  }
}

function pushTemplateLiteralBody(body: string, into: Set<string>): void {
  const interpolationRe = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;
  let im: RegExpExecArray | null;
  while ((im = interpolationRe.exec(body)) !== null) {
    pushClassLikeStrings(im[0], into);
  }
  pushTokens(body.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => '$'), into);
}

function pushClassLikeStrings(text: string, into: Set<string>): void {
  const quotedStringRe = /(["'`])((?:(?!\1).)*)\1/g;
  let qm: RegExpExecArray | null;
  while ((qm = quotedStringRe.exec(text)) !== null) {
    const [, quote, content] = qm;
    if (quote === '`') pushTemplateLiteralBody(content!, into);
    else pushTokens(content!, into);
  }
}

// Matches a JSX opening/self-closing tag's name, e.g. the `a` in `<a href=`
// or `<a>`, the `img` in `<img />` — lowercase-only, since intrinsic HTML
// elements in JSX must start lowercase (a capitalized `<Section>` is a
// component reference, never a real DOM tag, and is naturally excluded by
// this pattern rather than needing a separate filter). Used to drive
// reset.ts's buildResetCSS() — only the tags a project actually renders
// need their reset rules in the static kbach.css.
const JSX_TAG_RE = /<([a-z][a-zA-Z0-9]*)[\s/>]/g;

/** Exported for tests only — internal to the plugin otherwise. */
export function scanUsedTags(code: string): Set<string> {
  const cleaned = stripComments(code);
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  JSX_TAG_RE.lastIndex = 0;
  while ((m = JSX_TAG_RE.exec(cleaned)) !== null) tags.add(m[1]!);
  return tags;
}

/** Exported for tests only — internal to the plugin otherwise. */
export function extractClassStrings(rawCode: string): string[] {
  const code = stripComments(rawCode);
  const found = new Set<string>();

  // 1. Simple string attrs: className="..." or kb="...".
  const simpleRe = /(?:className|kb)=(["'])((?:(?!\1).)*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = simpleRe.exec(code)) !== null) pushTokens(m[2]!, found);

  // 2. JSX expression block: className={...} — brace-tracking for nested {}.
  // `\b` anchors both patterns below to a whole identifier — without it,
  // "kb"/"cn" match as bare substrings of any longer minified identifier
  // (e.g. "...arkb={" or "reactCn("), and a stray huge minified/vendor file
  // under an `include` dir could otherwise produce thousands of spurious
  // matches. MAX_BLOCK_SCAN_LEN caps the manual depth-scan walk per match so
  // a malformed/never-closing match can't walk to EOF of a large file —
  // bounds each match's cost regardless of file size or match count.
  const MAX_BLOCK_SCAN_LEN = 20_000;
  const jsxExprRe = /\b(?:className|kb)=\{/g;
  while ((m = jsxExprRe.exec(code)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const scanEnd = Math.min(code.length, i + MAX_BLOCK_SCAN_LEN);
    let block = '';
    while (i < scanEnd && depth > 0) {
      const ch = code[i];
      if (ch === '{') depth++;
      else if (ch === '}') { if (--depth === 0) break; }
      block += ch;
      i++;
    }
    jsxExprRe.lastIndex = i + 1;
    if (depth === 0) pushClassLikeStrings(block, found);
  }

  // 3. clsx / cn / classnames / cx / kb() call — paren-depth tracking.
  const classComposerCallRe = /\b(?:clsx|cn|classnames|cx|kb)\(/g;
  while ((m = classComposerCallRe.exec(code)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const scanEnd = Math.min(code.length, i + MAX_BLOCK_SCAN_LEN);
    let block = '';
    while (i < scanEnd && depth > 0) {
      const ch = code[i];
      if (ch === '(') depth++;
      else if (ch === ')') { if (--depth === 0) break; }
      block += ch;
      i++;
    }
    classComposerCallRe.lastIndex = i + 1;
    if (depth === 0) pushClassLikeStrings(block, found);
  }

  // 4. Any other template literal in the file — catches one assigned to a
  // variable and spread into className some other way. Harmless to double-
  // scan one already caught above — `found` is a Set.
  const templateRe = /`([^`]{1,2000})`/g;
  while ((m = templateRe.exec(code)) !== null) pushTemplateLiteralBody(m[1]!, found);

  return [...found];
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', '.next', '.output', '.git', '.svn', '.cache', 'coverage']);
const MAX_SCAN_DEPTH = 10;

const DEFAULT_FILE_MATCH = /\.(tsx?|jsx?)$/;

/**
 * Recursively walks `dir`, calling `onFile` for every entry matching
 * `fileMatch` (source files by default). Shared by scanning source files
 * for class strings (the default) and — via a different `fileMatch` —
 * scanning the project's own stylesheets for literal class selectors (see
 * unknownClassWarnings.ts) — the walking logic (skip dirs, depth cap,
 * unreadable-file handling) is identical either way.
 */
export function scanDir(
  dir: string,
  onFile: (filePath: string, code: string) => void,
  depth = 0,
  fileMatch: RegExp = DEFAULT_FILE_MATCH,
): void {
  if (depth > MAX_SCAN_DEPTH) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) scanDir(full, onFile, depth + 1, fileMatch);
      else if (fileMatch.test(entry)) onFile(full, readFileSync(full, 'utf-8'));
    } catch {
      // Unreadable file/symlink — skip.
    }
  }
}
