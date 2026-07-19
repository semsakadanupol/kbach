import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
// This file is Node-only (Vite build time). Import process explicitly and cast
// to NodeJS.Process instead of relying on the ambient global — global.d.ts
// declares a minimal `process` shim ({ env: { NODE_ENV } }) for browser/RN
// runtime files, which otherwise shadows the full Process type here and hides
// `.platform`/`.cwd()`.
import processImport from 'node:process';
import type { Plugin } from 'vite';

const process = processImport as NodeJS.Process;

// Normalize file paths to forward slashes so initialScan (which uses path.join →
// backslashes on Windows) and handleHotUpdate (which uses Vite's forward-slash paths)
// produce the same Map key. Without this, stale tokens accumulate as separate entries.
function normPath(p: string): string {
  const fwd = p.replace(/\\/g, '/');
  return process.platform === 'win32' ? fwd.toLowerCase() : fwd;
}
import { setCSSGenMode } from './core/platform';
import { BASE_RESET } from './core/reset';
import { buildConfig } from './core/config';
import { generateClassCSS } from './core/resolver';
import { splitClassTokens, parseClass } from './core/parser';
import { resolveUtility } from './core/utilities';
import type { FrameworkConfig, ThemeConfig } from './core/types';

// This module runs in Node.js (Vite build time). Force web mode so that
// web-only resolver branches generate CSS instead of returning null.
setCSSGenMode(true);

// ─── Terminal color helpers ────────────────────────────────────────────────────
// Plain ANSI escapes — no chalk/picocolors dependency needed for a handful of
// codes. No-ops when stdout isn't a color-capable TTY (CI logs, redirected
// output) or NO_COLOR is set, so raw escape codes never leak into log files.
const useColor = !!process.stdout?.isTTY && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const purple = (s: string) => paint('35', s);
const yellow = (s: string) => paint('33', s);
const dim = (s: string) => paint('2', s);
const bold = (s: string) => paint('1', s);
const TAG = () => `${bold(purple('[kbach]'))}`;

/** Short, single-line warning: "[kbach] <message>" with the tag colored and the message in yellow. */
function warn(message: string): void {
  console.warn(`${TAG()} ${yellow(message)}`);
}

/** Multi-line warning: header in yellow, tag prefix, extra detail lines passed through as-is (already formatted/dimmed by the caller). */
function warnBlock(header: string, ...lines: string[]): void {
  console.warn([`${TAG()} ${yellow(header)}`, ...lines].join('\n'));
}

// Most terminals (VS Code's integrated terminal, iTerm2, Windows Terminal, …)
// auto-detect a bare `path:line:column` and turn it into a clickable link that
// opens the file at that exact position — no editor-launching machinery needed
// on our side, just printing the location in this exact, widely-recognized shape.
function findLineCol(code: string, needle: string): { line: number; column: number } | null {
  const index = code.indexOf(needle);
  if (index === -1) return null;
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < index; i++) {
    if (code.charCodeAt(i) === 10 /* \n */) { line++; lastNewline = i; }
  }
  return { line, column: index - lastNewline };
}

/** Warning with a clickable `file:line:column` location, when the token's position can be found. */
function warnAt(message: string, root: string, filePath: string, code: string, needle: string): void {
  const pos = findLineCol(code, needle);
  // Forward slashes regardless of OS — Windows' path.relative() returns
  // backslashes, but terminal auto-linkers (VS Code's included) recognize
  // forward-slash paths more reliably across platforms.
  const relPath = relative(root, filePath).replace(/\\/g, '/');
  const location = pos ? `${relPath}:${pos.line}:${pos.column}` : relPath;
  console.warn(`${TAG()} ${yellow(message)}\n  ${dim('at')} ${location}`);
}

const KBACH_START = '/* kbach:start */';
const KBACH_END = '/* kbach:end */';

// ── CSS grouping ──────────────────────────────────────────────────────────────

const GROUPS = [
  ['Layout',     /^(flex(?!-\d|-auto|-none|-initial|-1)|flex-(col|row|wrap|nowrap)|grid|block|inline|hidden|table|contents|overflow|items-|justify-|self-|place-|grow|shrink|float-|clear-|static|fixed|absolute|relative|sticky|z-|top-|right-|bottom-|left-|inset|aspect)/],
  ['Sizing',     /^(w-|h-|min-w-|max-w-|min-h-|max-h-|size-|flex-1|flex-auto|flex-none|flex-initial|basis-)/],
  ['Spacing',    /^(p-|px-|py-|pt-|pb-|pl-|pr-|m-|mx-|my-|mt-|mb-|ml-|mr-|gap-|space-)/],
  ['Typography', /^(text-(xs|sm|base|lg|\dxl)|font-|leading-|tracking-|uppercase|lowercase|capitalize|normal-case|italic|not-italic|underline|overline|line-through|no-underline|truncate|whitespace-|text-(left|center|right|justify|start|end)|list-|align-|line-clamp)/],
  ['Colors',     /^(bg-|text-|color-|fill-|stroke-|caret-|accent-)/],
  ['Borders',    /^(border|rounded|ring|outline|divide)/],
  ['Effects',    /^(shadow|opacity|blur|brightness|contrast|grayscale|transition|duration|ease|delay|animate|scale|rotate|translate|transform|cursor|pointer|select-)/],
] as const;

const GROUP_ORDER = ['Layout', 'Sizing', 'Spacing', 'Typography', 'Colors', 'Borders', 'Effects', 'Utilities', 'Dark Mode', 'Responsive'];

function classifyToken(token: string, responsiveRe: RegExp): string {
  if (/^dark:/.test(token)) return 'Dark Mode';
  if (responsiveRe.test(token)) return 'Responsive';
  const base = token.replace(/^(hover|focus|active|group-hover|peer-hover):/, '');
  for (const [label, re] of GROUPS) {
    if ((re as RegExp).test(base)) return label;
  }
  return 'Utilities';
}

// ── CSS variable extraction ───────────────────────────────────────────────────
//
// Bug #10 fix: scan usedCSS ONCE with a regex to collect all hex values into a
// Set, then check membership in O(1) per color entry. Previous code used
// usedCSS.includes(val) which was O(colors × cssLength).

function buildColorVarMap(theme: ThemeConfig, usedCSS: string): Map<string, string> {
  // Build the hex-values-in-use set in one regex pass.
  const usedHexValues = new Set<string>();
  const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
  let hm: RegExpExecArray | null;
  while ((hm = hexRe.exec(usedCSS)) !== null) usedHexValues.add(hm[0].toLowerCase());

  const map = new Map<string, string>();
  for (const [name, shades] of Object.entries(theme.colors ?? {})) {
    const entries: [string, unknown][] = typeof shades === 'string'
      ? [[name, shades]]
      : Object.entries(shades as Record<string, unknown>).map(([s, v]) => [`${name}-${s}`, v]);
    for (const [fullName, val] of entries) {
      if (typeof val === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(val)) {
        if (usedHexValues.has(val.toLowerCase())) {
          map.set(val, `--color-${fullName}`);
        }
      }
    }
  }
  return map;
}

// ── CSS formatter ─────────────────────────────────────────────────────────────

function formatKbachCSS(tokenCSS: Map<string, string>, theme: ThemeConfig, responsiveRe: RegExp): string {
  const allRaw = [...tokenCSS.values()].filter(Boolean).join('\n');
  const colorVars = buildColorVarMap(theme, allRaw);

  // Replace longest hex values first — every hex value starts with '#' followed
  // only by hex digits, so the only way one can appear as a literal substring of
  // another is as a same-position prefix (e.g. '#fff' inside '#ffffff'). Sorting
  // descending by length ensures the longer value is already substituted before
  // the shorter one's search runs, so it can no longer corrupt it.
  const sortedColorVars = [...colorVars].sort(([a], [b]) => b.length - a.length);

  function applyVars(css: string): string {
    for (const [val, varName] of sortedColorVars)
      css = css.split(val).join(`var(${varName})`);
    return css;
  }

  const groups = new Map<string, string[]>(GROUP_ORDER.map(g => [g, []]));
  for (const [token, css] of tokenCSS) {
    if (!css) continue;
    const label = classifyToken(token, responsiveRe);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(applyVars(css));
  }

  const out: string[] = ['/* Generated by Kbach — do not edit */'];

  if (colorVars.size > 0) {
    out.push('\n:root {');
    for (const [val, varName] of colorVars) out.push(`  ${varName}: ${val};`);
    out.push('}');
  }

  const globalCSS = buildThemeGlobal(theme);
  if (globalCSS) out.push(`\n/* Global */\n${globalCSS}`);

  for (const label of GROUP_ORDER) {
    const items = groups.get(label) ?? [];
    if (!items.length) continue;
    out.push(`\n/* ${label} */`);
    out.push(items.join('\n'));
  }

  return out.join('\n');
}

function buildThemeGlobal(theme: ThemeConfig): string {
  const lines: string[] = [BASE_RESET];
  const ff = theme.fontFamily;
  if (ff?.sans && ff.sans !== 'System') {
    const family = Array.isArray(ff.sans) ? ff.sans.join(', ') : ff.sans;
    lines.push(`body { font-family: ${family}; }`);
  }
  return lines.join('\n');
}

// ── File helpers ──────────────────────────────────────────────────────────────

// Directories that are never user source — skip to avoid false positives and
// infinite loops from symlinks.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.output',
  '.git', '.svn', '.cache', 'coverage', '__pycache__',
]);

function findKbachCSS(root: string): string | null {
  const found: string[] = [];

  function scan(dir: string, depth: number): void {
    if (depth > 10) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) scan(full, depth + 1);
        else if (entry === 'kbach.css') found.push(full);
      } catch {}
    }
  }

  scan(root, 0);

  if (found.length === 0) return null;

  // Sort by path depth so the shallowest (closest to root) wins.
  found.sort((a, b) => a.split(/[\\/]/g).length - b.split(/[\\/]/g).length);

  if (found.length > 1) {
    warnBlock(
      `Multiple kbach.css found, using the shallowest — remove the rest:`,
      ...found.map(f => dim(`  ${f}`)),
    );
  }

  return found[0];
}

function writeKbachToFile(filePath: string, css: string): boolean {
  let existing = '';
  try { existing = readFileSync(filePath, 'utf-8'); } catch {}
  const block = `${KBACH_START}\n${css}\n${KBACH_END}`;
  const start = existing.indexOf(KBACH_START);
  const end = existing.indexOf(KBACH_END);
  const next = start !== -1 && end !== -1 && end > start
    ? existing.slice(0, start) + block + existing.slice(end + KBACH_END.length)
    : (existing ? `${existing}\n\n${block}` : block);
  if (next === existing) return false;
  writeFileSync(filePath, next, 'utf-8');
  return true;
}

function toNumericScreens(screens: Record<string, string | number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(screens)) {
    out[k] = typeof v === 'number' ? v : parseInt(String(v), 10);
  }
  return out;
}

// ── Class string extraction ────────────────────────────────────────────────────
//
// Bug #15 fix: handle ternaries, template literals, clsx/cn call patterns,
// and array-of-strings in addition to plain string literals.

/**
 * Handle the body of a template literal (the text between its backticks):
 * scan quoted strings INSIDE each ${...} interpolation too — a ternary or
 * `cond && '…'` there commonly holds real class names, e.g.
 * `${isActive ? 'active' : ''}` — then push the static parts outside any
 * ${...} as a plain class string. Recurses through pushClassLikeStrings so a
 * quoted string (or another template literal) nested inside an interpolation
 * is scanned the same way, at any depth.
 *
 * Regexes are created fresh on every call rather than hoisted to module
 * scope — pushClassLikeStrings and pushTemplateLiteralBody call each other
 * recursively, and a shared `g`-flagged RegExp's mutable lastIndex would get
 * clobbered by the inner call before the outer call's own while-loop reads
 * it again, corrupting the iteration into an infinite loop.
 */
function pushTemplateLiteralBody(body: string, into: Set<string>): void {
  const interpolationRe = /\$\{(?:[^{}]|\{[^{}]*\})*\}/g;
  let im: RegExpExecArray | null;
  while ((im = interpolationRe.exec(body)) !== null) {
    pushClassLikeStrings(im[0], into);
  }
  pushTokens(body.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ' '), into);
}

/**
 * Push every class-like string found in `text` into `into`. Scans for quoted
 * segments requiring the OPENING and CLOSING delimiter to be the SAME quote
 * character (via the \1 backreference) — a naive /["'`]…["'`]/ pattern
 * matches ANY quote character at both ends independently, so a template
 * literal's backticks mixed with a nested "double-quoted" ternary branch
 * (`${cond ? "a" : "b"}`) would pair a backtick with an unrelated quote
 * elsewhere in the text, and everything in between (including stray
 * `?`/`:`/`&&` punctuation) gets tokenized as garbage "class names".
 *
 * A backtick-delimited match is a template literal, not a plain string — its
 * content is handled by pushTemplateLiteralBody instead of being tokenized
 * as-is, otherwise `${...}` interpolation syntax ends up split on whitespace
 * into more garbage tokens right alongside the real class names.
 *
 * Shared by JSX expression blocks, clsx()-style calls, and (via
 * pushTemplateLiteralBody's own recursion) template literals nested inside
 * either of those or inside each other. See pushTemplateLiteralBody's
 * comment for why the regex is created fresh here rather than hoisted.
 */
function pushClassLikeStrings(text: string, into: Set<string>): void {
  const quotedStringRe = /(["'`])((?:(?!\1).)*)\1/g;
  let qm: RegExpExecArray | null;
  while ((qm = quotedStringRe.exec(text)) !== null) {
    const [, quote, content] = qm;
    if (quote === '`') pushTemplateLiteralBody(content, into);
    else pushTokens(content, into);
  }
}

function extractClassStrings(code: string): string[] {
  const found = new Set<string>();

  // 1. Simple string attrs: className="..." or kb="..."
  const simpleRe = /(?:className|kb)=["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = simpleRe.exec(code)) !== null) pushTokens(m[1], found);

  // 2. JSX expression block: className={...} — brace-tracking to handle nested {}.
  // The old regex ([^}]{1,500}) stopped at the first } inside a member expression
  // or object literal, missing class strings in the second ternary branch.
  const jsxExprRe = /(?:className|kb)=\{/g;
  while ((m = jsxExprRe.exec(code)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    let block = '';
    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === '{') depth++;
      else if (ch === '}') { if (--depth === 0) break; }
      block += ch;
      i++;
    }
    jsxExprRe.lastIndex = i + 1;
    pushClassLikeStrings(block, found);
  }

  // 3. clsx / cn / classnames / cx call — paren-depth tracking handles nested calls.
  // The old [^)] regex stopped at the first ) inside any nested function call.
  const clsxCallRe = /(?:clsx|cn|classnames|cx)\(/g;
  while ((m = clsxCallRe.exec(code)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    let block = '';
    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === '(') depth++;
      else if (ch === ')') { if (--depth === 0) break; }
      block += ch;
      i++;
    }
    clsxCallRe.lastIndex = i + 1;
    pushClassLikeStrings(block, found);
  }

  // 4. Any other template literal in the file: `bg-red-500 ${cond ? 'p-4' : 'p-2'}`.
  // A blanket scan, so one already inside a className={}/kb={}/clsx() block
  // above gets processed twice — harmless, `found` is a Set. This catches
  // template literals used some other way (e.g. assigned to a variable that's
  // later spread into className, or a styled()-style tagged usage) that the
  // more targeted scans above don't look for.
  const templateRe = /`([^`]{1,2000})`/g;
  while ((m = templateRe.exec(code)) !== null) pushTemplateLiteralBody(m[1], found);

  return [...found];
}

// Never a real class name, regardless of how it was extracted:
//  - contains $, {, or } — leftover ${...} interpolation syntax the
//    extraction couldn't fully resolve (e.g. multi-level-nested template
//    literals, beyond what the regex-based interpolation matcher balances)
//  - ends with a bare "-" — the static remainder of a token whose OTHER half
//    was a ${...} interpolation (`` `nested-${size}` `` leaves "nested-"
//    once the dynamic part is blanked out; genuinely unresolvable statically,
//    not a typo). Only the trailing dash, not a leading one — Kbach's
//    negative-value syntax (`-mt-4`, `-mx-2`) legitimately starts with "-".
//  - entirely ternary/logical-operator/quote punctuation ("?", ":", "&&",
//    `""}`) left over from a mismatched or partially-resolved expression
const NOT_A_CLASS_NAME_RE = /[${}]|-$|^[?:&|!"'=<>]+$/;

function pushTokens(str: string, into: Set<string>): void {
  for (const tok of splitClassTokens(str)) {
    if (tok && !NOT_A_CLASS_NAME_RE.test(tok)) into.add(tok);
  }
}

// ── Directory scan ─────────────────────────────────────────────────────────────

function scanDir(dir: string, onFile: (filePath: string, code: string) => void): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      warn(`Can't read ${dir}: ${(err as Error).message}`);
    }
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) scanDir(full, onFile);
      else if (/\.(tsx?|jsx?)$/.test(entry)) onFile(full, readFileSync(full, 'utf-8'));
    } catch (err) {
      warn(`Can't process ${full}: ${(err as Error).message}`);
    }
  }
}

// ── Project CSS selector index ──────────────────────────────────────────────────
//
// The "unknown utility" check below needs to tell apart two very different
// situations that both look like "not a Kbach class": a genuine typo (nothing
// anywhere styles it — dead weight, worth flagging), and a class the project
// intentionally defines itself (CSS Modules, a plain stylesheet, a third-party
// component's own class) that Kbach was never meant to resolve. Only the first
// one is worth a warning. This scans every .css/.scss/.sass/.less file the same
// includeDirs cover and extracts literal class-selector names (a regex over the
// raw text, not a real CSS/Sass parser — nested selectors and interpolation
// still contain the class name as a literal substring, so this is good enough
// without needing a stylesheet AST).

const CSS_CLASS_SELECTOR_RE = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
const CSS_FILE_RE = /\.(css|scss|sass|less)$/;

/** Extract every literal class-selector name in one stylesheet file into `into`. */
function scanCssFileInto(filePath: string, into: Set<string>): void {
  try {
    const text = readFileSync(filePath, 'utf-8');
    let m: RegExpExecArray | null;
    CSS_CLASS_SELECTOR_RE.lastIndex = 0;
    while ((m = CSS_CLASS_SELECTOR_RE.exec(text)) !== null) into.add(m[1]!);
  } catch { /* unreadable file — skip */ }
}

function scanCssSelectorsInto(dir: string, into: Set<string>): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    const full = join(dir, entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) scanCssSelectorsInto(full, into);
      else if (CSS_FILE_RE.test(entry)) scanCssFileInto(full, into);
    } catch { /* unreadable file — skip */ }
  }
}

// Strip a leading chain of Kbach modifier prefixes (hover:, dark:, group-hover/card:, …)
// to recover the base class name as it would actually appear in a stylesheet selector.
function stripModifierPrefix(token: string): string {
  return token.replace(/^(?:[a-zA-Z0-9_/-]+:)+/, '');
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export interface KbachPluginOptions {
  framework?: FrameworkConfig;
  /** Directories to scan for class strings (relative to Vite root). Defaults to common source dirs. */
  include?: string[];
}

const DEFAULT_SCAN_DIRS = ['src', 'app', 'pages', 'components', 'views', 'layouts'];

export function kbach(userConfigOrOptions?: FrameworkConfig | KbachPluginOptions): Plugin {
  // Accept both legacy `kbach(frameworkConfig)` and new `kbach({ framework, include })` forms
  const isOptions = userConfigOrOptions != null &&
    ('framework' in (userConfigOrOptions as object) || 'include' in (userConfigOrOptions as object));
  const userConfig = isOptions
    ? (userConfigOrOptions as KbachPluginOptions).framework
    : userConfigOrOptions as FrameworkConfig | undefined;
  const includeDirs = (isOptions ? (userConfigOrOptions as KbachPluginOptions).include : undefined) ?? DEFAULT_SCAN_DIRS;

  const cfg = buildConfig(userConfig ?? {});
  const screens = toNumericScreens(cfg.theme.screens ?? {});
  const screenKeys = Object.keys(cfg.theme.screens ?? {});
  const responsivePattern = screenKeys.length
    ? screenKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    : 'sm|md|lg|xl|2xl';
  const responsiveRe = new RegExp(`^(${responsivePattern}):`);
  let root = process.cwd();
  let mainCSSFile: string | null = null;

  // Bug #9 fix: incremental tracking.
  //   fileTokens : path → Set<string>   — which tokens a file contributes
  //   tokenCSS   : token → css string   — cached CSS per token (never regenerated unless new)
  const fileTokens = new Map<string, Set<string>>();
  const tokenCSS   = new Map<string, string>();

  // Literal class-selector names found anywhere in the project's own .css/.scss/
  // .sass/.less files — see scanCssSelectorsInto's comment above for why this
  // exists. Populated once at buildStart, before the JS/TSX scan runs (so the
  // check below has the full picture), and grown incrementally as stylesheets
  // change during dev.
  const projectCssClasses = new Set<string>();
  const warnedTokens = new Set<string>();

  function checkUnknownToken(tok: string, filePath: string, code: string): void {
    if (process.env.NODE_ENV === 'production' || warnedTokens.has(tok) || tok.startsWith('__')) return;

    const parsed = parseClass(tok);
    // resolveUtility() !== null is the authoritative "does Kbach resolve this"
    // check — deliberately not isKnownUtility(parsed.utility), which only checks
    // the utility PREFIX and would treat garbage like "flex-not-a-real-value" as
    // known just because "flex" itself is a real prefix. And not tokenCSS.get(tok)
    // either, which is falsy for legitimate utilities that produce no CSS
    // declarations of their own (`group`/`peer` markers resolve to an empty style
    // object, so generateClassCSS emits '' for them even though they're valid).
    if (parsed && resolveUtility(parsed, cfg.theme) !== null) return;

    // Not a Kbach utility — but that alone isn't a typo. Only warn if the class
    // also isn't defined anywhere in the project's own stylesheets (see
    // scanCssSelectorsInto's comment above).
    const base = stripModifierPrefix(tok);
    if (!base || projectCssClasses.has(base)) return;

    warnedTokens.add(tok);
    warnAt(`Unknown class "${tok}" — no Kbach utility or project CSS rule matches it. Typo?`, root, filePath, code, tok);
  }

  function processFile(filePath: string, code: string): void {
    const key = normPath(filePath);
    const tokens = new Set<string>();
    for (const tok of extractClassStrings(code)) {
      tokens.add(tok);
      if (!tokenCSS.has(tok)) {
        tokenCSS.set(tok, generateClassCSS(tok, cfg.theme, cfg.darkMode, screens));
      }
      checkUnknownToken(tok, filePath, code);
    }
    fileTokens.set(key, tokens);
  }

  function scanProjectCssSelectors(): void {
    for (const dir of includeDirs) scanCssSelectorsInto(join(root, dir), projectCssClasses);
  }

  function buildTokenCSSView(): Map<string, string> {
    // Build a merged view of only tokens still referenced by at least one file.
    // Tokens that disappear from all files are implicitly excluded (no delete needed).
    const active = new Set<string>();
    for (const tokens of fileTokens.values()) for (const t of tokens) active.add(t);
    const view = new Map<string, string>();
    for (const tok of active) {
      const css = tokenCSS.get(tok);
      if (css !== undefined) view.set(tok, css);
    }
    return view;
  }

  function initialScan(): void {
    for (const dir of includeDirs) {
      scanDir(join(root, dir), processFile);
    }
  }

  function generateCSS(): string {
    return formatKbachCSS(buildTokenCSSView(), cfg.theme, responsiveRe);
  }

  return {
    name: 'kbach',
    enforce: 'pre',

    // Without this, Vite only discovers @kbach/react needs pre-bundling once it
    // actually crawls into an import of it — typically the FIRST page load — and
    // has to stop, optimize it, and force a full reload mid-render. That reload
    // can land in the middle of a render pass (React hooks resolving against a
    // module graph that's being swapped out from under it), which is what an
    // "Invalid hook call" / hook-related crash on first load only usually is.
    // Declaring it here upfront means Vite pre-bundles it during its initial
    // dependency scan, before any page ever requests it — no mid-render reload.
    config() {
      return {
        optimizeDeps: {
          include: ['@kbach/react', '@kbach/react/jsx-runtime', '@kbach/react/jsx-dev-runtime'],
        },
      };
    },

    configResolved(resolved) {
      root = resolved.root;

      // React Router's own Vite plugin (name: 'react-router') already includes
      // its own JSX transform + Fast Refresh integration. Adding @vitejs/plugin-react
      // on top (name: 'vite:react-refresh') makes both inject a Fast Refresh
      // preamble into the same module — the page crashes at runtime with
      // "Identifier 'RefreshRuntime' has already been declared" before React
      // ever hydrates, and every class on the page silently fails to style
      // because the app never actually mounts. Catch it here instead of
      // leaving it as an unexplained blank/unstyled page + browser console error.
      const names = new Set(resolved.plugins.map((p) => p.name));
      if (names.has('react-router') && names.has('vite:react-refresh')) {
        warnBlock(
          '@vitejs/plugin-react + reactRouter() conflict — page will crash before styles apply.',
          dim('  Both inject Fast Refresh ("RefreshRuntime already declared").'),
          dim('  Fix: remove react() from vite.config.ts — tsconfig jsxImportSource is enough.'),
        );
      }
    },

    // When any JS/TS file imports kbach.css, prepend a disableRuntimeCSS() call
    // so styles come solely from the static stylesheet — no duplicate injection.
    transform(code, id) {
      if (!/\.(tsx?|jsx?|mjs?)$/.test(id)) return;
      if (!/\bimport\b[^;]*['"].*kbach\.css['"]/i.test(code)) return;
      return {
        code: `import { disableRuntimeCSS } from '@kbach/react';\ndisableRuntimeCSS();\n${code}`,
        map: null,
      };
    },

    buildStart() {
      mainCSSFile = findKbachCSS(root);
      // Index project stylesheets BEFORE scanning JS/TSX — the unknown-utility
      // check needs the full picture of what's already styled elsewhere, not a
      // partial one that would misreport project-defined classes as unknown.
      scanProjectCssSelectors();
      initialScan();
      if (mainCSSFile) writeKbachToFile(mainCSSFile, generateCSS());
    },

    handleHotUpdate({ file, server }) {
      if (file.includes('node_modules')) return;

      if (CSS_FILE_RE.test(file)) {
        // Grow the index only — a selector that disappears from a stylesheet
        // just stops suppressing future warnings until the next full restart,
        // which is an acceptable imprecision for a dev-time diagnostic.
        scanCssFileInto(file, projectCssClasses);
        return;
      }

      if (!/\.(tsx?|jsx?)$/.test(file)) return;
      try {
        processFile(file, readFileSync(file, 'utf-8'));
      } catch {
        fileTokens.delete(normPath(file));
      }

      // Prune tokenCSS of every token no longer referenced by any file so
      // removed/renamed classes are immediately dropped from the cache and
      // the output CSS — not just filtered by buildTokenCSSView.
      const active = new Set<string>();
      for (const tokens of fileTokens.values()) for (const t of tokens) active.add(t);
      for (const tok of tokenCSS.keys()) {
        if (!active.has(tok)) tokenCSS.delete(tok);
      }

      if (mainCSSFile) {
        // Only notify Vite when the CSS content actually changed — avoids
        // spurious HMR updates on saves that don't touch any class names.
        const changed = writeKbachToFile(mainCSSFile, generateCSS());
        if (changed) server.watcher.emit('change', mainCSSFile);
      }
    },
  };
}
