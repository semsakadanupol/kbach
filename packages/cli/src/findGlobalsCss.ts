import { findFirstExisting } from './fsFind';

/**
 * Shared by init/next.ts and doctor/checks/postcssWiring.ts — one list, so
 * a path added to the Next.js global-stylesheet search only has to be
 * added once. `src/styles/globals.css` covers a real, common Pages Router
 * layout (global styles kept under `src/` but separate from `src/pages/`)
 * that the first three paths (App Router's `app/globals.css` /
 * `src/app/globals.css`, and the un-prefixed Pages Router convention
 * `styles/globals.css`) don't reach.
 */
export const GLOBALS_CSS_CANDIDATES = [
  'app/globals.css',
  'src/app/globals.css',
  'styles/globals.css',
  'src/styles/globals.css',
];

export function findGlobalsCssFile(root: string): string | null {
  return findFirstExisting(root, GLOBALS_CSS_CANDIDATES);
}
