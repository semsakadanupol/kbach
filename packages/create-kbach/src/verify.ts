import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

// ─── Existing-setup detection (read-only) ──────────────────────────────────
//
// Never writes anything — see RULES.md rule 5 / cli.ts's Tier 1/2 split.
// Purely used to decide whether a Tier 2 snippet is still needed or can be
// skipped because the user (or a previous create-kbach run) already did it
// by hand. A false "not found" just means the CLI prints the snippet it
// would have printed anyway (today's behavior — safe). A false "found" would
// wrongly SKIP a snippet the user still needs, so every check here stays
// conservative: only a clear textual match counts, never a guess.

// Bounded, best-effort list of where an app root/entry point commonly lives.
// Covers plain Vite (src/main.tsx), CRA-style (src/App.tsx / App.tsx),
// Next.js App Router (app/layout.tsx), and Expo Router (app/_layout.tsx).
const ENTRY_FILE_CANDIDATES = [
  'src/main.tsx', 'src/main.jsx', 'src/main.ts',
  'src/App.tsx', 'src/App.jsx',
  'App.tsx', 'App.jsx',
  'app/layout.tsx', 'app/layout.jsx',
  'app/_layout.tsx', 'app/_layout.jsx',
  'index.tsx', 'index.jsx',
];

function readIfExists(root: string, relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(root, relPath), 'utf-8');
  } catch {
    return null;
  }
}

function findFirstMatch(root: string, candidates: string[], test: (content: string) => boolean): string | null {
  for (const rel of candidates) {
    const content = readIfExists(root, rel);
    if (content && test(content)) return rel;
  }
  return null;
}

// Matches @kbach/ui as well as the pre-rename @kbach/react / @kbach/native
// names — someone migrating an older install still has valid wiring that
// shouldn't be reported as missing.
const KBACH_PKG_RE = /@kbach\/(ui|react|native)/;

/** Returns the relative path of the entry file that already wires up ThemeProvider, or null. */
export function findThemeProviderWiring(root: string): string | null {
  return findFirstMatch(
    root,
    ENTRY_FILE_CANDIDATES,
    (c) => c.includes('ThemeProvider') && KBACH_PKG_RE.test(c),
  );
}

/** Returns the relative path of the entry file that already imports the generated kbach.css, or null. */
export function findKbachCssImport(root: string): string | null {
  return findFirstMatch(root, ENTRY_FILE_CANDIDATES, (c) => /['"][^'"]*kbach\.css['"]/.test(c));
}

const VITE_CONFIG_CANDIDATES = ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs'];

/** True if any vite.config.* already references the Kbach Vite plugin. */
export function viteConfigHasPlugin(root: string): boolean {
  return VITE_CONFIG_CANDIDATES.some((rel) => {
    const c = readIfExists(root, rel);
    return !!c && /@kbach\/(ui|react)\/vite/.test(c);
  });
}

/** True if an existing babel.config.js already references the Kbach Babel preset. */
export function babelConfigHasPreset(root: string): boolean {
  const c = readIfExists(root, 'babel.config.js');
  return !!c && /@kbach\/(ui|react|native)\/babel/.test(c);
}

// ─── @kbach/ui peer-dependency compatibility ───────────────────────────────
//
// Not full semver range support — deliberately hand-rolled (same call as
// cli.ts's flag parsing), because @kbach/ui's actual peerDependencies are
// all simple "minimum version" or "same major" shapes (">=X.Y.Z" / "^X.Y.Z"),
// never a real range union like "^18 || ^19". Extracting major/minor/patch
// from both sides and comparing numerically covers exactly those shapes
// correctly, without pulling in the semver package for one narrow check.

function parseVersion(v: string): [number, number, number] | null {
  // Strips a leading range operator (^, ~, >=) and any trailing pre-release/
  // build tag — good enough for the plain "^X.Y.Z" / ">=X.Y.Z" shapes above,
  // not a general semver parser.
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Checks an installed version against a peerDependencies-style constraint.
 * `^X.Y.Z` is treated as "same major, >= X.Y.Z" (correct for the caret
 * semantics on a >=1.0.0 base, which is all @kbach/ui's peers ever use).
 * `>=X.Y.Z` is a plain minimum-version check. Anything else (a shape this
 * hand-rolled parser doesn't recognize) returns true — never block or warn
 * on a constraint form it can't confidently evaluate.
 */
export function satisfiesConstraint(installed: string, constraint: string): boolean {
  const installedVer = parseVersion(installed);
  if (!installedVer) return true; // can't parse the installed version (e.g. a "workspace:*" range) — don't guess

  if (constraint.startsWith('^')) {
    const min = parseVersion(constraint.slice(1));
    if (!min) return true;
    return installedVer[0] === min[0] && compareVersions(installedVer, min) >= 0;
  }
  if (constraint.startsWith('>=')) {
    const min = parseVersion(constraint.slice(2));
    if (!min) return true;
    return compareVersions(installedVer, min) >= 0;
  }
  return true;
}

/**
 * Fetches @kbach/ui's current peerDependencies from the registry and checks
 * them against what's already installed in the user's project. Best-effort:
 * any failure (offline, registry hiccup, unexpected shape) returns an empty
 * list rather than throwing — a compatibility hint is worth showing when
 * available, never worth blocking or breaking the install over.
 */
export function checkPeerDependencyCompat(pkg: Record<string, unknown>): string[] {
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };

  let peerDeps: Record<string, string>;
  try {
    // shell: true on Windows — same reason as actions.ts's installPackage:
    // "npm" resolves to npm.cmd there, which execFileSync can't find without
    // going through a shell.
    const raw = execFileSync('npm', ['view', '@kbach/ui', 'peerDependencies', '--json'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      shell: process.platform === 'win32',
    });
    peerDeps = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!peerDeps || typeof peerDeps !== 'object') return [];

  const warnings: string[] = [];
  for (const [name, constraint] of Object.entries(peerDeps)) {
    const installed = deps[name];
    if (!installed) continue; // not installed at all — optional peers (react-native, vite, @babel/core) are fine unset
    if (!satisfiesConstraint(installed, constraint)) {
      warnings.push(`${name}@${installed} in your project doesn't satisfy @kbach/ui's peer requirement (${constraint})`);
    }
  }
  return warnings;
}
