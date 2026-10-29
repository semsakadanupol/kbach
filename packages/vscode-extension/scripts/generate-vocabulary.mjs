// Generates the completion seed vocabulary from the Rust crate's OWN test
// fixtures — every resolver module's `#[cfg(test)]` suite already calls
// `parse_class("some-real-example")` dozens of times to exercise its own
// `resolve()` arm. Scraping those string literals gives real, verified-
// valid-at-some-point examples with zero new Rust code and zero hand-
// maintained list to go stale — see this package's own AGENTS.md for why
// this is deliberately the v1 approach rather than a proper enumerated
// "list every utility" Rust export (the correct long-term answer, deferred).
//
// Not rigorous: a few resolver test names deliberately exercise INVALID
// input (e.g. "returns_none_for_an_unresolvable_class") and get scraped
// right alongside the valid ones. That's an acceptable false-positive
// SUGGESTION in the completion list — hover/diagnostics are validated for
// real against the actual WASM engine at use-time regardless of what's in
// this seed list, so a stray bad suggestion here is a minor UX wart, not
// a correctness bug.
//
//
// On top of the scraped set, this script ALSO generates a much more
// complete spacing-scale vocabulary programmatically: property prefixes
// (p/px/m/w/h/inset/gap/...) x a real numeric/keyword/fraction value set,
// each candidate checked for real against the actual Node-target WASM
// engine (the same `generate_css` every other Kbach surface uses) before
// being added — unlike the scraped set above, a candidate here is either
// engine-verified-valid or silently dropped, never a guess that ships
// unchecked. This is what actually gets BASE_UTILITIES from ~600 scraped
// fixture tokens up to the full real scale (e.g. all of p-0..p-96, not
// just whichever handful a Rust test happened to exercise).
//
// Usage: node generate-vocabulary.mjs <output-path-relative-to-cwd>
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const thisDir = dirname(fileURLToPath(import.meta.url));
const coreEngineSrc = join(thisDir, '..', '..', 'core-engine', 'src');
const coreEngineDistNode = join(thisDir, '..', '..', 'core-engine', 'dist-node', 'kbach_core_engine.js');

const outputArg = process.argv[2];
if (!outputArg) {
  console.error('Usage: node generate-vocabulary.mjs <output-path>');
  process.exit(1);
}

function listRustFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listRustFiles(full));
    else if (entry.endsWith('.rs')) out.push(full);
  }
  return out;
}

const PARSE_CLASS_RE = /parse_class\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;

const rawTokens = new Set();
for (const file of listRustFiles(coreEngineSrc)) {
  const source = readFileSync(file, 'utf-8');
  let m;
  while ((m = PARSE_CLASS_RE.exec(source)) !== null) {
    rawTokens.add(m[1]);
  }
}

// Reject anything that doesn't look like a plausible class token at all —
// catches the handful of deliberately-malformed fixtures (an unescaped
// trailing backslash, embedded whitespace/quotes) without needing to know
// which specific test each one came from.
function looksPlausible(token) {
  if (token.length === 0 || token.length > 80) return false;
  if (/[\\"'\s]/.test(token)) return false;
  return true;
}

// Splits on ':' that are NOT inside a `[...]` bracket pair — the same
// "don't split an arbitrary value or an arbitrary modifier selector like
// [&:hover]:" rule every real splitter in this codebase (parser.rs,
// jsEngine/parser.ts's splitRespectingBrackets) already implements.
function splitRespectingBrackets(token) {
  const parts = [];
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

const modifiers = new Set();
const baseUtilities = new Set();

for (const token of rawTokens) {
  if (!looksPlausible(token)) continue;
  const segments = splitRespectingBrackets(token);
  const base = segments[segments.length - 1];
  if (base) baseUtilities.add(base);
  for (const modifier of segments.slice(0, -1)) {
    // An arbitrary-value modifier (`@min-[400px]:`, `data-[state=open]:`,
    // `has-[a:hover]:`, `group-[.is-published]:`) has a specific baked-in
    // value from whichever test happened to use it — suggesting that
    // LITERAL value back to every user is actively misleading, unlike a
    // plain named modifier (`dark:`, `hover:`, `group-hover:`, `sm:`),
    // which is genuinely reusable as-is. Excluded from suggestions here;
    // still a real, valid modifier shape the engine itself accepts.
    if (modifier && !modifier.includes('[')) modifiers.add(`${modifier}:`);
  }
}

// --- Programmatic, engine-verified spacing-scale candidates -----------
//
// require(), not import — dist-node/kbach_core_engine.js is wasm-pack's
// `--target nodejs` CommonJS output (same reasoning as this repo's own
// generate-palette.mjs, which this mirrors).
const require = createRequire(import.meta.url);
const { generate_css } = require(coreEngineDistNode);

const THEME_JSON = JSON.stringify({ colors: {}, spacing: {}, screens: {}, darkMode: 'media', container: {} });

function engineResolves(token) {
  try {
    const result = JSON.parse(generate_css(token, THEME_JSON));
    return Array.isArray(result.rules) && result.rules.length > 0;
  } catch {
    return false;
  }
}

// Real Tailwind's own default spacing scale (and this project's own
// quarter-rem formula fallback for anything not in an explicit theme —
// see core-engine/src/resolvers/mod.rs's spacing_px) — the numbers an
// actual user would reach for, not an exhaustive integer sweep.
const SPACING_SCALE = [
  '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96', 'px',
];
const SIZE_KEYWORDS = ['auto', 'full', 'screen', 'min', 'max', 'fit', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'];
const FRACTIONS = ['1/2', '1/3', '2/3', '1/4', '2/4', '3/4', '1/5', '2/5', '3/5', '4/5', '1/6', '5/6', '1/12', '5/12', '7/12', '11/12'];
const SMALL_INTS = ['0', '1', '2', '3', '4', '5', '10', '20', '30', '40', '50'];

// Plain spacing props: a numeric/px value only (no "full"/"auto"/fractions
// — real Tailwind doesn't generate those for padding/margin/gap either).
const SPACING_PREFIXES = ['p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'gap', 'gap-x', 'gap-y'];
// Sizing props: numeric/px scale PLUS keywords/named sizes/fractions.
const SIZING_PREFIXES = ['w', 'h', 'min-w', 'max-w', 'min-h', 'max-h', 'size', 'basis', 'inline', 'block', 'min-inline', 'max-inline', 'min-block', 'max-block'];
// Inset-family: numeric/px scale PLUS "auto"/"full"/fractions (negatable,
// but the leading "-" is a distinct token the engine already handles —
// no need to generate it separately here).
const INSET_PREFIXES = ['top', 'right', 'bottom', 'left', 'inset', 'inset-x', 'inset-y', 'start', 'end'];
const SMALL_INT_PREFIXES = ['z', 'order'];

const generatedCandidates = new Set();
for (const prefix of SPACING_PREFIXES) {
  for (const value of SPACING_SCALE) generatedCandidates.add(`${prefix}-${value}`);
}
for (const prefix of SIZING_PREFIXES) {
  for (const value of [...SPACING_SCALE, ...SIZE_KEYWORDS, ...FRACTIONS]) generatedCandidates.add(`${prefix}-${value}`);
}
for (const prefix of INSET_PREFIXES) {
  for (const value of [...SPACING_SCALE, 'auto', 'full', ...FRACTIONS]) generatedCandidates.add(`${prefix}-${value}`);
}
for (const prefix of SMALL_INT_PREFIXES) {
  for (const value of SMALL_INTS) generatedCandidates.add(`${prefix}-${value}`);
}

let verifiedCount = 0;
for (const candidate of generatedCandidates) {
  if (engineResolves(candidate)) {
    baseUtilities.add(candidate);
    verifiedCount++;
  }
}

const output = `// Generated by Kbach — do not edit.
// Regenerate: npm run generate:vocabulary. Two sources, merged:
//  1. Scraped from packages/core-engine's own Rust test fixtures.
//  2. Programmatically generated spacing-scale candidates (property
//     prefix x real value scale), each checked for real against the
//     actual Node-target WASM engine before being included — see this
//     script's own doc comment.
export const MODIFIERS: string[] = ${JSON.stringify([...modifiers].sort(), null, 2)};

export const BASE_UTILITIES: string[] = ${JSON.stringify([...baseUtilities].sort(), null, 2)};
`;

mkdirSync(dirname(join(process.cwd(), outputArg)), { recursive: true });
writeFileSync(outputArg, output);
console.log(
  `Wrote ${outputArg} (${modifiers.size} modifiers, ${baseUtilities.size} base utilities total — ` +
    `${rawTokens.size} scraped tokens + ${verifiedCount}/${generatedCandidates.size} engine-verified generated candidates)`,
);
