import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot } from './projectRoot';

/**
 * Same signal `@kbach/cli`'s own `detect.ts` already uses to tell Expo/
 * React Native CLI apart from a web project — a plain dependency check,
 * not a full framework detection (this only needs a yes/no).
 *
 * `findProjectRoot` (shared with `kbach.config.js` discovery) does the
 * actual walk-up from `startDir` — the first version of this function
 * checked only `startDir` itself, which silently returned `false` for
 * every file in a monorepo (e.g. a file under `packages/react-native/
 * src/` needs THAT package's package.json, not the VS Code workspace
 * folder's — usually the repo root, which has no `react-native`/`expo`
 * dependency at all), defeating the whole feature.
 */
export function isReactNativeProject(startDir: string): boolean {
  const root = findProjectRoot(startDir);
  if (!root) return false;
  const pkgPath = join(root, 'package.json');
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps['react-native'] || deps.expo);
  } catch {
    return false;
  }
}

/**
 * Splits on ':' outside `[...]` brackets — same rule every real splitter
 * in this codebase uses.
 */
function splitRespectingBrackets(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of token) {
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
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

const UNSUPPORTED_MODIFIER_RE = /^(group(-|$|\/)|peer(-|$|\/)|has-\[|@)/;
const UNSUPPORTED_PSEUDO_MODIFIERS = new Set(['before', 'after', 'first-letter', 'first-line', 'selection', 'marker', 'backdrop']);
const GRID_BASE_RE = /^(grid\b|grid-|col-|row-|auto-cols-|auto-rows-)/;

/**
 * The exact list root AGENTS.md's own "read this first" callout and
 * react-native/AGENTS.md §4's "Not supported" list name: `group-*`,
 * `peer-*`, `has-[…]`, container queries, grid, `before:`/`after:` and
 * other pseudo-elements. These all PARSE without error on native and
 * apply ZERO style, with no runtime warning at all — confirmed in that
 * same doc as the single most dangerous silent-failure class in this
 * project, which is exactly why this exists: surfacing it at edit time,
 * in a React Native project specifically (these all work completely
 * normally on web — this check only ever fires when `isReactNativeProject`
 * is true).
 *
 * Returns a human-readable reason naming which unsupported feature was
 * found, or `null` if `token` doesn't use any of them.
 */
export function nativeUnsupportedReason(token: string): string | null {
  const segments = splitRespectingBrackets(token);
  const modifiers = segments.slice(0, -1);
  const base = segments[segments.length - 1]!;

  for (const modifier of modifiers) {
    if (UNSUPPORTED_MODIFIER_RE.test(modifier)) {
      if (modifier.startsWith('group')) return `"${modifier}:" (group-* has no cascade to inherit through on native)`;
      if (modifier.startsWith('peer')) return `"${modifier}:" (peer-* has no cascade to inherit through on native)`;
      if (modifier.startsWith('has-[')) return `"${modifier}:" (has-[…] needs a real CSS :has(), which native has no equivalent of)`;
      return `"${modifier}:" (container queries have no native equivalent)`;
    }
    if (UNSUPPORTED_PSEUDO_MODIFIERS.has(modifier)) {
      return `"${modifier}:" (pseudo-elements have no native equivalent)`;
    }
  }

  if (GRID_BASE_RE.test(base)) return `"${base}" (CSS grid has no native equivalent)`;

  return null;
}
