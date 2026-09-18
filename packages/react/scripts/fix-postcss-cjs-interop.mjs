// dist/postcss-plugin.js's CJS build ends with `module.exports =
// __toCommonJS(postcss_plugin_exports)`, giving `{ default: kbachPostcss,
// __esModule: true }` — a plain object, not the callable plugin function
// itself. Next.js's internal postcss plugin loader (and any other
// require()-based postcss.config loader, which is the norm — postcss
// configs are conventionally CJS) does `require('@kbach/react/postcss')`
// expecting either a function or an object with `.postcss === true`
// directly on it; getting `{ default: fn }` instead means neither check
// passes, so the loader hands the wrapper object itself to
// `new postcss.Processor([...])`, which throws "[object Object] is not a
// PostCSS plugin" (webpack) or silently no-ops (Turbopack — confirmed live
// against a real `create-next-app` scaffold on both bundlers).
//
// tsup ships a `cjsInterop` option that's supposed to append exactly this
// shim automatically, but it did not fire for this entry in this build
// (verified: identical output with and without the option enabled) — so,
// same as react-native's append-classname-types.mjs, this is a
// deterministic post-build step instead of trusting tsup's own mechanism.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../dist');
const path = join(distDir, 'postcss-plugin.js');
const original = readFileSync(path, 'utf-8');

if (!/module\.exports\s*=\s*__toCommonJS\(/.test(original)) {
  throw new Error(`${path} doesn't end in the expected __toCommonJS(...) shape — tsup's output format changed, update this script.`);
}

writeFileSync(path, `${original}\nmodule.exports = module.exports.default;\n`);
