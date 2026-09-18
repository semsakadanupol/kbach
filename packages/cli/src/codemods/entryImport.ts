import { findFirstExisting } from '../fsFind';

const ENTRY_CANDIDATES = [
  'src/main.tsx',
  'src/main.ts',
  'src/main.jsx',
  'src/main.js',
  'app/root.tsx',
  'app/root.ts',
];

/** Locates the Vite entry file — `src/main.*`, or React Router framework mode's `app/root.*`. */
export function findEntryFile(root: string): string | null {
  return findFirstExisting(root, ENTRY_CANDIDATES);
}

const KBACH_CSS_IMPORT_RE = /^\s*import\s+['"][^'"]*kbach\.css['"];?\s*$/m;
const IMPORT_LINE_RE = /^\s*import\s/;

/** Shared with doctor/checks/kbachCssGenerated.ts — same "is it imported" definition either way. */
export function hasKbachCssImport(source: string): boolean {
  return KBACH_CSS_IMPORT_RE.test(source);
}

/**
 * Line-based, not AST-based — inserting one standalone import statement
 * carries none of the "which array/property" ambiguity the vite.config.ts
 * codemod has to resolve, so a full parse would be needless weight here.
 * No-ops if any import already targets a `kbach.css`-named file anywhere
 * in the source, regardless of its relative path.
 */
export function patchEntryFileImport(source: string): { changed: boolean; code: string } {
  if (hasKbachCssImport(source)) return { changed: false, code: source };

  const lines = source.split('\n');
  let lastImportLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (IMPORT_LINE_RE.test(lines[i]!)) lastImportLine = i;
  }

  const insertionLine = lastImportLine + 1;
  lines.splice(insertionLine, 0, "import './kbach.css';");
  return { changed: true, code: lines.join('\n') };
}
