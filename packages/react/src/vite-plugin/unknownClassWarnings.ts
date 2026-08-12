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

const CSS_CLASS_SELECTOR_RE = /\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g;
const CSS_FILE_RE = /\.(css|scss|sass|less)$/;

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

/**
 * Warns once per unique token when it's both unresolvable by Kbach and
 * absent from the project's own stylesheets. `isResolvable` is the caller's
 * job to determine (see index.ts — `generateCssForToken(...).rules.length > 0`).
 */
export function warnIfUnknownClass(
  token: string,
  filePath: string,
  isResolvable: boolean,
  projectCssClasses: Set<string>,
  warnedTokens: Set<string>,
): void {
  if (isResolvable || warnedTokens.has(token)) return;

  const base = stripModifierPrefix(token);
  if (!base || projectCssClasses.has(base)) return;

  warnedTokens.add(token);
  console.warn(`[kbach] Unknown class "${token}" — no Kbach utility or project CSS rule matches it. Typo?\n  at ${filePath}`);
}
