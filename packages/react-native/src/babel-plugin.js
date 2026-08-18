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
 * exists (see `getConfigStatement`'s own doc comment), so a project never
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
// existsSync + template-build work happen ONCE per root, not on every
// single file `pre()` runs for.
const _configStatementCache = new Map();

/**
 * Builds the (uncompiled) AST statement that applies `kbach.config.js`,
 * cached per `root` after the first call — `null` if no such file exists
 * there. `root` defaults to `process.cwd()` (how `metro start`/`expo
 * start` are conventionally invoked) at the plugin's own call site below;
 * pass `{ configRoot: '...' }` as this plugin's Babel options if your
 * `kbach.config.js` lives somewhere else (a monorepo where Metro's actual
 * working directory isn't the app's own root, for instance).
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
function getConfigStatement(root) {
  if (_configStatementCache.has(root)) return _configStatementCache.get(root);

  const configPath = path.join(root, 'kbach.config.js');
  if (!fs.existsSync(configPath)) {
    _configStatementCache.set(root, null);
    return null;
  }

  const buildStatement = template(
    `require('@kbach/react-native').applyKbachConfig(require(${JSON.stringify(configPath)}));`,
  );
  const statement = buildStatement();
  _configStatementCache.set(root, statement);
  return statement;
}

module.exports = function kbachReactNativeBabelPlugin(_babel, options) {
  const configRoot = (options && options.configRoot) || process.cwd();

  return {
    name: 'kbach-react-native',
    pre(file) {
      const filename = file.opts && file.opts.filename;
      if (filename && filename.indexOf('node_modules') !== -1) return;

      const comments = file.ast.comments || (file.ast.comments = []);
      const alreadySet = comments.some((c) => /@jsxImportSource|@jsxRuntime/.test(c.value));
      if (!alreadySet) {
        comments.unshift({ type: 'CommentLine', value: ' @jsxImportSource @kbach/react-native' });
      }

      const configStatement = getConfigStatement(configRoot);
      if (configStatement) {
        file.ast.program.body.unshift(configStatement);
      }
    },
    visitor: {},
  };
};

/** Exported for tests only — clears the per-root config-file cache between test cases. */
module.exports._resetForTests = function resetForTests() {
  _configStatementCache.clear();
};
