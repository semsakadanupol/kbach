import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { PackageManager } from './detect';
import { kbachConfigTemplate, kbachCssTemplate, babelConfigTemplate } from './templates';

export type FileResult = 'created' | 'skipped-exists';

/** Never overwrites an existing file — matches packages/react/scripts/postinstall.js's convention. */
function writeFileIfMissing(filePath: string, content: string): FileResult {
  if (fs.existsSync(filePath)) return 'skipped-exists';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return 'created';
}

export function writeKbachConfig(root: string): { result: FileResult; path: string } {
  const filePath = path.join(root, 'kbach.config.js');
  return { result: writeFileIfMissing(filePath, kbachConfigTemplate()), path: filePath };
}

/** Written into src/ when that directory exists (the common Vite layout), else the project root. */
export function writeKbachCss(root: string): { result: FileResult; path: string } {
  const dir = fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src') : root;
  const filePath = path.join(dir, 'kbach.css');
  return { result: writeFileIfMissing(filePath, kbachCssTemplate()), path: filePath };
}

/** Only ever called when no babel.config.js already exists — see cli.ts. */
export function writeBabelConfig(root: string): { result: FileResult; path: string } {
  const filePath = path.join(root, 'babel.config.js');
  return { result: writeFileIfMissing(filePath, babelConfigTemplate()), path: filePath };
}

// ─── tsconfig.json jsx/jsxImportSource merge ──────────────────────────────────
//
// Safe to auto-patch despite being an existing file (unlike vite.config.ts /
// App.tsx / babel.config.js — see cli.ts's Tier 1/2 split) because the WRITE
// is a minimal, provably-additive text splice, never a full parse+reserialize:
// comments and formatting elsewhere in the file are preserved byte-for-byte.
// The comment-stripped parse below is used ONLY to inspect whether it's safe
// to do that splice — never to regenerate the file — so a parse failure or an
// unexpected shape just means falling back to Tier 2 (print instructions),
// not a corrupted write.

export type TsconfigMergeStatus =
  | 'merged'
  | 'already-set'
  | 'no-file'
  | 'unparseable'
  | 'conflict'
  | 'no-compiler-options-block';

// Best-effort only — used purely to decide whether the splice below is safe,
// never to regenerate the file, so a string like "//" inside a path value
// being misread as a comment just means falling back to Tier 2, not a bad write.
//
// Replaces comment characters with same-length whitespace rather than
// deleting them, so every index in the stripped string still lines up
// exactly with `raw` — mergeTsconfigJsx's insertion-point regex runs against
// this output specifically so a commented-out "compilerOptions": { block
// can't be mistaken for the real one, and needs those offsets to carry
// straight over to `raw` for the splice to land in the right place.
function stripJsonComments(text: string): string {
  return text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, (match) => match.replace(/[^\n]/g, ' '));
}

function findTsconfigPath(root: string): string | null {
  // Modern Vite scaffolds split tsconfig.json (a "references"-only solution
  // file) from tsconfig.app.json (where compilerOptions actually lives).
  // Prefer tsconfig.app.json when both exist; fall back to tsconfig.json for
  // the common single-file layout (older Vite templates, CRA, most non-Vite
  // TS projects).
  const appConfig = path.join(root, 'tsconfig.app.json');
  const baseConfig = path.join(root, 'tsconfig.json');
  if (fs.existsSync(appConfig)) return appConfig;
  if (fs.existsSync(baseConfig)) return baseConfig;
  return null;
}

export function mergeTsconfigJsx(root: string): { status: TsconfigMergeStatus; path?: string } {
  const tsconfigPath = findTsconfigPath(root);
  if (!tsconfigPath) return { status: 'no-file' };

  const raw = fs.readFileSync(tsconfigPath, 'utf-8');
  const stripped = stripJsonComments(raw);
  let parsed: { compilerOptions?: Record<string, unknown> };
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { status: 'unparseable', path: tsconfigPath };
  }

  const co = parsed.compilerOptions;
  if (co && co.jsxImportSource === '@kbach/react' && co.jsx === 'react-jsx') {
    return { status: 'already-set', path: tsconfigPath };
  }
  if (co && ('jsx' in co || 'jsxImportSource' in co)) {
    // Something else already set these — don't silently overwrite a value
    // that might be intentional (e.g. a project already using a different
    // jsxImportSource for another library).
    return { status: 'conflict', path: tsconfigPath };
  }

  // Matched against `stripped`, not `raw` — a commented-out compilerOptions
  // block ahead of the real one would otherwise match first and splice the
  // insertion into dead text. stripJsonComments preserves offsets exactly
  // (comments become same-length whitespace), so the index found here is
  // valid to slice into `raw` directly below.
  const blockMatch = /"compilerOptions"\s*:\s*\{/.exec(stripped);
  if (!blockMatch) return { status: 'no-compiler-options-block', path: tsconfigPath };

  const insertAt = blockMatch.index + blockMatch[0].length;
  const insertion = `\n    "jsx": "react-jsx",\n    "jsxImportSource": "@kbach/react",`;
  const next = raw.slice(0, insertAt) + insertion + raw.slice(insertAt);
  fs.writeFileSync(tsconfigPath, next, 'utf-8');
  return { status: 'merged', path: tsconfigPath };
}

// ─── Package install ──────────────────────────────────────────────────────────

const INSTALL_COMMAND: Record<PackageManager, [string, string[]]> = {
  npm: ['npm', ['install']],
  pnpm: ['pnpm', ['add']],
  yarn: ['yarn', ['add']],
  bun: ['bun', ['add']],
};

/** Returns true on success. Inherits stdio so the user sees real install progress/errors. */
export function installPackage(pm: PackageManager, packageName: string, cwd: string): boolean {
  const [cmd, baseArgs] = INSTALL_COMMAND[pm];
  const result = spawnSync(cmd, [...baseArgs, packageName], { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  return result.status === 0;
}
