#!/usr/bin/env node
// Generates a TRIMMED copy of the wasm-pack web-target glue
// (dist/kbach_core_engine.js) for @kbach/react-native's nativeBridge.web.ts
// to import directly as its own source file, instead of depending on the
// external @kbach/core-engine package for the web path at all.
//
// Why this needs to exist rather than just `import { initSync,
// resolve_style_json } from '@kbach/core-engine'`: the FULL glue file also
// contains an unused async `init()`/`__wbg_init` function (wasm-bindgen's
// default export) whose body references `import.meta.url` — and
// `import.meta` is syntactically valid ONLY inside an ES module. Metro
// doesn't always load @kbach/react-native's dependency graph as ESM
// uniformly across every bundling target: Expo Router's static-rendering
// (SSR) server bundle in particular loads it in a context where
// `import.meta` throws "Cannot use 'import.meta' outside a module" at
// PARSE time — before any code even runs, since the dead `init()` function
// is never called but its source text still has to parse — confirmed by
// hand against a real Expo Router app with static rendering enabled.
// nativeBridge.web.ts never calls that function at all (it uses
// `initSync()` with the base64-embedded binary from generate-wasm-base64.mjs
// instead), so the fix is removing it from the copy react-native actually
// ships, not chasing every bundler's module-format quirks.
//
// Strips (by name, brace-matched — not needed by nativeBridge.web.ts):
//   - default_colors_json (build-time-only export)
//   - generate_css (the `.class`-selector CSS generator @kbach/react uses
//     against a real DOM `className` — Expo Web can't use it at all, since
//     react-native-web doesn't forward `className` to the DOM; see
//     generate_css_attr's own doc comment in lib.rs)
//   - __wbg_load, __wbg_init (the async init path; __wbg_init is the one
//     that references import.meta.url)
// Keeps everything else — the marshaling helpers, `resolve_style_json`,
// `generate_css_attr` (the `[data-kb~="..."]`-selector CSS generator Expo
// Web's hover:/focus:/group-*/etc. support uses), and `initSync` —
// byte-for-byte as wasm-bindgen generated them, so this script only ever
// removes code, never rewrites logic by hand.
//
// Usage: node generate-web-glue.mjs <output-path-relative-to-cwd>
// Run manually after `npm run build` regenerates dist/kbach_core_engine.js
// — not wired into any prebuild hook, same reasoning as this directory's
// other generate-*.mjs scripts.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const thisDir = dirname(fileURLToPath(import.meta.url));

const outputArg = process.argv[2];
if (!outputArg) {
  console.error('Usage: node generate-web-glue.mjs <output-path-relative-to-cwd>');
  process.exit(1);
}

const glueSourcePath = join(thisDir, '..', 'dist', 'kbach_core_engine.js');
let source = readFileSync(glueSourcePath, 'utf8');

/** Removes one top-level function declaration (by its exact start marker) via brace counting, plus its preceding `/** ... *\/` JSDoc block if it has one — throws if the marker isn't found, so a wasm-bindgen codegen change fails loudly instead of silently shipping a stale/wrong trim. */
function stripFunction(src, startMarker) {
  let start = src.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`generate-web-glue.mjs: expected to find "${startMarker}" in ${glueSourcePath} — wasm-bindgen's codegen may have changed; update this script's strip list.`);
  }
  // Absorb a directly-preceding JSDoc block (and the blank line before it,
  // if any) so removing the function doesn't leave an orphaned comment
  // describing code that's no longer there.
  const docEnd = src.lastIndexOf('*/', start);
  const docStart = docEnd === -1 ? -1 : src.lastIndexOf('/**', docEnd);
  if (docStart !== -1 && src.slice(docEnd + 2, start).trim() === '') {
    start = docStart;
  }

  let depth = 0;
  let i = src.indexOf('{', src.indexOf(startMarker));
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) {
    throw new Error(`generate-web-glue.mjs: unbalanced braces while stripping "${startMarker}"`);
  }
  // Also swallow one trailing newline so the removal doesn't leave a
  // double-blank-line gap where the function used to be.
  let end = i + 1;
  if (src[end] === '\n') end++;
  return src.slice(0, start) + src.slice(end);
}

for (const marker of [
  'export function default_colors_json() {',
  'export function generate_css(class_string, theme_json) {',
  'async function __wbg_load(module, imports) {',
  'async function __wbg_init(module_or_path) {',
]) {
  source = stripFunction(source, marker);
}

if (source.includes('import.meta')) {
  throw new Error('generate-web-glue.mjs: "import.meta" is still present after stripping — the strip list above is out of date.');
}

source = source.replace('export { initSync, __wbg_init as default };', 'export { initSync };');

const header = `// Generated by Kbach — do not edit.
// Trimmed copy of @kbach/core-engine's web-target wasm-bindgen glue — see
// packages/core-engine/scripts/generate-web-glue.mjs's own doc comment for
// why this is vendored here instead of importing @kbach/core-engine
// directly (short version: this package's unused async init() function
// references import.meta.url, which breaks parsing under some bundler
// targets — e.g. Expo Router's static-rendering SSR bundle — even though
// it's never called).
// Regenerate: npm run generate:web-glue (after changing Rust source and
// rebuilding core-engine's web-target WASM build).
//
// @ts-nocheck — plain wasm-bindgen-generated JS with no type annotations;
// nativeBridge.web.ts's own imports from this file are the only public
// surface that matters and are used correctly there, so this file's
// internal helpers being implicitly \`any\` is an acceptable, deliberate
// tradeoff for staying byte-for-byte generated rather than hand-typed.
`;

const outPath = join(process.cwd(), outputArg);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, header + '\n' + source);

console.log(`Wrote ${outPath}`);
