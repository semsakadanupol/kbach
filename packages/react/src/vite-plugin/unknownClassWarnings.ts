// Ported from old-kbach/src/vite-plugin.ts's scanCssSelectorsInto/checkUnknownToken.
//
// "Not a Kbach utility" alone isn't a typo — a class could be CSS Modules,
// a plain stylesheet, or a third-party component's own class that Kbach was
// never meant to resolve. Only warn when a token is BOTH unresolvable by
// Kbach AND absent from the project's own stylesheets — a regex scan over
// the project's .css/.scss/.sass/.less files (not a real CSS/Sass parser;
// nested selectors and interpolation still contain the class name as a
// literal substring, which is good enough here).
import { join } from 'path';
import { scanDir } from './scan';
import { blue, bold, gray, green, highlight, kbachTag } from '../terminalWarn';

const CSS_CLASS_SELECTOR_RE = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
const CSS_FILE_RE = /\.(css|scss|sass|less)$/;

// Most terminals (VS Code's integrated terminal, iTerm2, Windows Terminal, …)
// auto-detect a bare `path:line:column` and turn it into a clickable link
// that jumps straight to the exact spot — no editor-launching machinery
// needed on our side, just printing the location in this exact, widely
// recognized shape. Ported from old-kbach/src/vite-plugin.ts's findLineCol.
function findLineCol(code: string, needle: string): { line: number; column: number } | null {
  const index = code.indexOf(needle);
  if (index === -1) return null;
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < index; i++) {
    if (code.charCodeAt(i) === 10 /* \n */) {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: index - lastNewline };
}

/** Exported for tests only — internal to the plugin otherwise. */
export function scanCssFileInto(code: string, into: Set<string>): void {
  const re = new RegExp(CSS_CLASS_SELECTOR_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) into.add(m[1]!);
}

/** Scans every stylesheet under `includeDirs` for literal class selectors. */
export function scanProjectCssSelectors(root: string, includeDirs: string[]): Set<string> {
  const projectCssClasses = new Set<string>();
  for (const dir of includeDirs) {
    scanDir(join(root, dir), (_filePath, code) => scanCssFileInto(code, projectCssClasses), 0, CSS_FILE_RE);
  }
  return projectCssClasses;
}

// Strips a leading chain of Kbach modifier prefixes (hover:, dark:,
// group-hover:, ...) to recover the base class name as it would actually
// appear in a stylesheet selector.
function stripModifierPrefix(token: string): string {
  return token.replace(/^(?:[a-zA-Z0-9_/-]+:)+/, '');
}

// `group`/`peer` are pure ancestor/sibling-state MARKERS (see registry.rs's
// `group-hover`/`peer-hover`/etc. — they select via `.group:hover ` /
// `.peer:hover ~ `, which only ever matches an element actually carrying the
// literal `group`/`peer` class) — they resolve to zero CSS declarations by
// design, and `css.rs`'s `build_rule` returns `None` for an empty
// declaration list, so `generateCssForToken(...).rules.length` is always 0
// for them. That's indistinguishable from a genuine typo using only the
// rules array, so they're allowlisted here instead — the one place this
// engine's "known utility" concept doesn't map cleanly onto "produces CSS".
const MARKER_CLASSES = new Set(['group', 'peer']);

/**
 * Warns once per unique token when it's both unresolvable by Kbach and
 * absent from the project's own stylesheets. `isResolvable` is the caller's
 * job to determine (see index.ts — `generateCssForToken(...).rules.length > 0`).
 * `code` is the file's full source text — used only to find the token's
 * exact `line:column` for the location line; `filePath` alone is still
 * printed when the token's position can't be found (e.g. a dynamically
 * assembled string extraction already normalized away).
 */
export function warnIfUnknownClass(
  token: string,
  filePath: string,
  code: string,
  isResolvable: boolean,
  projectCssClasses: Set<string>,
  warnedTokens: Set<string>,
): void {
  if (isResolvable || warnedTokens.has(token)) return;

  const base = stripModifierPrefix(token);
  if (!base || projectCssClasses.has(base) || MARKER_CLASSES.has(base)) return;

  warnedTokens.add(token);
  const pos = findLineCol(code, token);
  // Path in blue, exact line:column in green — easier on the eyes than a
  // single flat color, and the pairing most editors/terminals already use
  // for clickable file locations (e.g. TypeScript's own diagnostics).
  const location = pos ? `${blue(filePath)}${green(`:${pos.line}:${pos.column}`)}` : blue(filePath);
  console.warn(
    `${kbachTag()} ${gray('Unknown class')} ${highlight(token)} ${gray('— no Kbach utility or project CSS rule matches it. Typo?')}\n  ${bold('at')} ${location}`,
  );
}
