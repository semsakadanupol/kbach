'use strict';

const path = require('path');
const fs = require('fs');
const template = require('@babel/template').default;

/**
 * Injects a per-file `@jsxImportSource @kbach/react-native` pragma comment
 * so Metro's JSX transform routes className resolution through
 * @kbach/react-native/jsx-runtime instead of react/jsx-runtime.
 *
 * Ported from old-kbach/src/native/babel-plugin/index.js's pre() hook —
 * same mechanism, same reason: setting jsxImportSource globally via preset
 * options would set the DEFAULT JSX pragma for every file Metro bundles,
 * including node_modules and React Native's own internals (which know
 * nothing about Kbach's className/style interception and would break). A
 * per-file pragma comment — explicitly skipping node_modules — only ever
 * applies to the user's own app files.
 *
 * Raw, unbuilt CommonJS on purpose: this runs inside a Metro/Babel worker
 * process, which can't require() TypeScript.
 *
 * Deliberately NOT porting old-kbach's build-time class-resolution half
 * (the __kbachStyles fast path) — resolution happens at the (already
 * synchronous) native-bridge call inside the jsx-runtime instead (see
 * nativeBridge.ts), so this plugin's only job is the pragma injection —
 * PLUS one more, added later: auto-applying `kbach.config.js` if one
 * exists (see `buildConfigStatement`'s own doc comment), so a project never
 * needs its own explicit `applyKbachConfig(kbachConfig)` call at all. That
 * addition deliberately still stops short of old-kbach's own version of
 * this (an mtime-polling live-reload of the config, re-checked on every
 * file) — a Babel-plugin-level change needs a dev-server restart to take
 * effect either way, so a one-time check per (root, process) pair is
 * enough, and much simpler to reason about.
 */

// Keyed by the root directory checked — undefined = not checked yet for
// that root, null = checked, no kbach.config.js found there. A Babel/Metro
// worker process transforms many files over its lifetime — this makes the
// existsSync check happen ONCE per root, not on every single file `pre()`
// runs for. Caches only the resolved PATH (or null) — never the built AST
// statement itself; see `buildConfigStatement`'s own doc comment for why
// that distinction is load-bearing, not a style preference.
const _configPathCache = new Map();

function resolveConfigPath(root) {
  if (_configPathCache.has(root)) return _configPathCache.get(root);
  const configPath = path.join(root, 'kbach.config.js');
  const resolved = fs.existsSync(configPath) ? configPath : null;
  _configPathCache.set(root, resolved);
  return resolved;
}

// Windows' filesystem is case-insensitive but case-preserving, and Metro's
// own `file.opts.filename` isn't guaranteed to share the exact casing/
// separator normalization `path.join` produces — comparing case-sensitively
// risked a false NEGATIVE (kbach.config.js not recognized as itself,
// re-introducing the self-require bug `buildConfigStatement`'s doc comment
// describes) far more than a false positive risks colliding two genuinely
// different files, which would require two paths differing ONLY by case in
// the same project — effectively never happens in practice.
function samePath(a, b) {
  return !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/**
 * Builds a FRESH (uncompiled) AST statement that applies `kbach.config.js`
 * — a NEW node on every single call, deliberately never cached or reused
 * across files. `root` defaults to `process.cwd()` (how `metro start`/
 * `expo start` are conventionally invoked) at the plugin's own call site
 * below; pass `{ configRoot: '...' }` as this plugin's Babel options if
 * your `kbach.config.js` lives somewhere else (a monorepo where Metro's
 * actual working directory isn't the app's own root, for instance).
 *
 * `null` if no such file exists at `root` (checked via the cached
 * `resolveConfigPath` above — `fs.existsSync` itself is cheap enough to
 * memoize per root without any of the risk rebuilding the AST fresh here
 * guards against).
 *
 * An EARLIER version of this function built the statement once per root
 * and cached/reused that SAME AST node object across every file's `pre()`
 * call. That's unsafe with Babel: a node spliced into one file's AST gets
 * mutated in place as THAT file's own transform pipeline runs (location
 * info, scope bindings, hoisting markers, ...) — sharing one mutable node
 * instance across many independently-processed file ASTs corrupts it after
 * the first file. Confirmed as the actual cause of a real bundling failure
 * (not a hypothetical): Metro's own dependency collector needs a require()
 * call's location info to validate/instrument it, and once the shared
 * node's location got corrupted by an earlier file's pass, Metro rejected
 * a LATER file's copy with "Invalid call at line <unknown>". Rebuilding
 * fresh per call fixes this at negligible cost — `@babel/template`'s own
 * parse is cheap, and this runs once per file Metro transforms regardless.
 *
 * The injected statement is a plain `require(...).applyKbachConfig(require(...))`
 * — no try/catch around it. `kbach.config.js`'s own path is only ever
 * baked in here after `existsSync` already confirmed it exists, so the
 * only way this could still throw is a genuine bug in that file (a syntax
 * error, a bad nested require) — letting that surface as a real, visible
 * Metro bundling error is far better than silently swallowing it: a
 * developer's real customization would otherwise go missing with zero
 * indication why, exactly the kind of headache a good default should avoid.
 *
 * `@babel/template` builds this from a plain string with the absolute path
 * JSON-escaped directly into it (correct on Windows too, backslashes and
 * all) — simpler than building the equivalent `@babel/types` node graph by
 * hand for one straightforward statement.
 */
function buildConfigStatement(root) {
  const configPath = resolveConfigPath(root);
  if (configPath === null) return null;

  const buildStatement = template(
    `require('@kbach/react-native').applyKbachConfig(require(${JSON.stringify(configPath)}));`,
  );
  return buildStatement();
}

module.exports = function kbachReactNativeBabelPlugin(_babel, options) {
  const configRoot = (options && options.configRoot) || process.cwd();

  return {
    name: 'kbach-react-native',
    pre(file) {
      const filename = file.opts && file.opts.filename;
      if (filename && filename.indexOf('node_modules') !== -1) return;

      // Metro/Expo's own internal polyfills (the Node.js-external-require
      // shim, the assets-registry shim, node:/weak-ref virtualizations, ...)
      // are synthetic "virtual modules" with no real file on disk. Expo's
      // own Metro config marks every one of these with an embedded NUL
      // control character in its module ID (Rollup's/Metro's own
      // convention for "this isn't a real file"). These never sit inside
      // node_modules, so the check above doesn't catch them — and Metro
      // places them directly in the bundle PRELUDE, entirely outside any
      // wrapped module, where `require` isn't defined as a real function
      // at all. Confirmed as a real, reproducible runtime crash (not a
      // hypothetical): injecting this plugin's applyKbachConfig() require()
      // call into that exact polyfill produced Expo's own "[runtime not
      // ready]: ReferenceError: Property 'require' doesn't exist" at app
      // startup, verified by exporting a real dev bundle and finding the
      // offending, un-instrumented require() call sitting inside
      // withMetroMultiPlatform.js's own external-require polyfill — a file
      // this plugin was never meant to touch at all.
      //
      // The control character is NOT at the start of `filename`, so
      // `startsWith`/`charCodeAt(0)` (what an earlier version of this
      // check used) never matches — confirmed by actually logging Babel's
      // real `filename` for this file, not assumed: Metro joins the
      // project root onto the raw virtual module ID first, so the control
      // character ends up in the MIDDLE of the full string, right after
      // the trailing path separator, not at index 0. A search anywhere in
      // the string (rather than just its start) is what actually catches
      // it — see this file's own test suite for the exact filename shape
      // this was verified against.
      if (filename && filename.indexOf(String.fromCharCode(0)) !== -1) return;

      const comments = file.ast.comments || (file.ast.comments = []);
      const alreadySet = comments.some((c) => /@jsxImportSource|@jsxRuntime/.test(c.value));
      if (!alreadySet) {
        comments.unshift({ type: 'CommentLine', value: ' @jsxImportSource @kbach/react-native' });
      }

      // Never inject the auto-apply statement into kbach.config.js itself —
      // it would require() its own absolute path, a real self-reference
      // cycle in Metro's dependency graph for a statement that makes no
      // sense there anyway (a config file applying itself to itself).
      if (samePath(filename, resolveConfigPath(configRoot))) return;

      const configStatement = buildConfigStatement(configRoot);
      if (configStatement) {
        file.ast.program.body.unshift(configStatement);
      }
    },
    visitor: {},
  };
};

/** Exported for tests only — clears the per-root config-path cache between test cases. */
module.exports._resetForTests = function resetForTests() {
  _configPathCache.clear();
};
