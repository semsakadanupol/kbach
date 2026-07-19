'use strict';

const path = require('path');
const fs = require('fs');

// ─── Terminal color helper ──────────────────────────────────────────────────────
// Plain ANSI escapes — no-ops when stdout isn't a color-capable TTY (CI logs,
// redirected output) or NO_COLOR is set.
const _useColor = !!(process.stdout && process.stdout.isTTY) && !process.env.NO_COLOR;
function _paint(code, s) { return _useColor ? `\x1b[${code}m${s}\x1b[0m` : s; }
function log(message) {
  console.log(`${_paint('1', _paint('35', '[kbach]'))} ${message}`);
}
function warn(message) {
  console.warn(`${_paint('1', _paint('35', '[kbach]'))} ${_paint('33', message)}`);
}

// ─── Cross-file resolve cache ─────────────────────────────────────────────────
// Keyed by (config file absolute path + classString) so that two projects/apps
// transformed by the same long-lived Babel/Metro worker process (a shared worker
// pool in a monorepo, or a multi-project Jest run) never share resolved styles
// for an identical class name that maps to a different theme in each project.
const _resolveCache = new Map();

// ─── Load core lazily, reloading when the dist changes ───────────────────────
//
// This plugin runs inside a plain Node.js process (a Metro/Babel worker), where
// @kbach/react's isWeb and isNative both read false — there's no `window` and no
// RN device globals. Left alone, getEffectiveIsWeb() would default to "web" and
// bake web-flavored values (e.g. padding: '10px' as a string) into the
// __kbachStyles this plugin injects, which the actual native runtime then uses
// verbatim (see jsx-runtime.tsx's `!isWeb && __kbachStyles != null` fast path) —
// breaking arbitrary values, transforms, and any other getEffectiveIsWeb()-gated
// utility on a real device. setResolveTarget('native') forces the correct answer
// for every resolve() call this plugin makes.
let _core = null;
let _coreMtime = 0;
let _corePath = null;
let _lastStatMs = 0;
const STAT_INTERVAL_MS = 500;

function getCore() {
  const now = Date.now();
  if (_core && (now - _lastStatMs) < STAT_INTERVAL_MS) return _core;

  try {
    if (!_corePath) _corePath = require.resolve('@kbach/react');
    const mtime = fs.statSync(_corePath).mtimeMs;
    _lastStatMs = now;
    if (_core && mtime === _coreMtime) return _core;
    for (const id of Object.keys(require.cache)) {
      if (id.includes(`${path.sep}@kbach${path.sep}react`) || id.includes(`${path.sep}packages${path.sep}react${path.sep}`)) {
        delete require.cache[id];
      }
    }
    _core = require('@kbach/react');
    _core.setResolveTarget?.('native');
    _coreMtime = mtime;
    _configCache.clear();
    _resolveCache.clear(); // config changed — invalidate resolve cache too
  } catch {
    if (!_core) {
      _core = require('@kbach/react');
      _core.setResolveTarget?.('native');
    }
  }
  return _core;
}

// ─── Load user config ─────────────────────────────────────────────────────────
// Keyed by resolved config file path (like _resolveCache above), not a single
// global slot — resolveProjectRoot() means two files in the same worker process
// can legitimately resolve to two DIFFERENT kbach.config.js paths (different
// projects sharing a Metro/Babel worker pool, see _resolveCache's comment). A
// single-slot cache was safe back when configFile resolution was always
// process.cwd()-based (constant for the whole process, so every call landed on
// the same path); with per-file roots, it would serve one project's cached
// config to another's classes. Each entry also tracks its own mtime so
// kbach.config.js edits are picked up during watch mode without restarting.
const _configCache = new Map(); // cfgPath -> { config, mtime, lastStatMs }
const CFG_STAT_INTERVAL_MS = 500;

function getUserConfig(configFile, root) {
  const cfgPath = path.resolve(root || process.cwd(), configFile);
  const now = Date.now();
  let entry = _configCache.get(cfgPath);

  if (entry && (now - entry.lastStatMs) < CFG_STAT_INTERVAL_MS) return entry.config;

  try {
    let mtime = 0;
    try { mtime = fs.statSync(cfgPath).mtimeMs; } catch {}

    if (entry && mtime === entry.mtime) {
      entry.lastStatMs = now;
      return entry.config;
    }

    // Config file changed (or first load for this path) — bust require cache
    // for it and reload.
    if (require.cache[cfgPath]) delete require.cache[cfgPath];
    // eslint-disable-next-line import/no-dynamic-require
    const userCfg = require(cfgPath);
    const { buildConfig } = getCore();
    entry = { config: buildConfig(userCfg), mtime, lastStatMs: now };
    _configCache.set(cfgPath, entry);
    _resolveCache.clear();
  } catch {
    if (!entry) {
      const { getConfig } = getCore();
      entry = { config: getConfig(), mtime: 0, lastStatMs: now };
      _configCache.set(cfgPath, entry);
    } else {
      entry.lastStatMs = now;
    }
  }
  return entry.config;
}

// Resolve the project root a config-relative path (kbach.config.js) should be
// read from. process.cwd() is only correct when the Metro/Babel worker's cwd
// happens to be the app directory — not guaranteed for a monorepo root script
// or a CI job invoked from the repo root. state.file.opts.root is Babel's own
// resolved project root (based on where babel.config.js was found for this
// file), which tracks the actual app directory regardless of the process cwd.
function resolveProjectRoot(state) {
  return (state && state.file && state.file.opts && state.file.opts.root)
    || (state && state.cwd)
    || process.cwd();
}

// Valid JS identifier pattern — avoids quoting camelCase property names like fontFamily.
const _identRe = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

// ─── Convert a StyleValue to a Babel AST ObjectExpression ────────────────────
function styleToAST(t, styles) {
  if (!styles || typeof styles !== 'object') return t.nullLiteral();

  const props = [];
  for (const [key, val] of Object.entries(styles)) {
    if (val === undefined || val === null) continue;

    let valueNode;
    if (typeof val === 'number') {
      valueNode = val < 0 ? t.unaryExpression('-', t.numericLiteral(-val)) : t.numericLiteral(val);
    } else if (typeof val === 'string') {
      valueNode = t.stringLiteral(val);
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      valueNode = styleToAST(t, val);
    } else if (Array.isArray(val)) {
      valueNode = t.arrayExpression(val.map(item =>
        typeof item === 'object' ? styleToAST(t, item) : t.stringLiteral(String(item)),
      ));
    } else {
      valueNode = t.stringLiteral(String(val));
    }

    // Use t.identifier for valid identifier keys (e.g. fontFamily) instead of
    // t.stringLiteral, which generates unnecessary quoted keys in the output.
    const keyNode = _identRe.test(key) ? t.identifier(key) : t.stringLiteral(key);
    props.push(t.objectProperty(keyNode, valueNode));
  }

  return t.objectExpression(props);
}

// ─── Convert a ResolvedStyle to a Babel AST ObjectExpression ─────────────────
function resolvedStyleToAST(t, resolved) {
  const props = [];
  for (const [bucketKey, styles] of Object.entries(resolved)) {
    if (!styles || Object.keys(styles).length === 0) continue;
    props.push(
      t.objectProperty(t.stringLiteral(bucketKey), styleToAST(t, styles)),
    );
  }
  return t.objectExpression(props);
}

// ─── Runtime config init AST ─────────────────────────────────────────────────
// Generates a call injected into every transformed file:
//
//   ;(function(){
//     try { require('@kbach/native').initConfig(require('/path/to/kbach.config.js')); } catch(_e) {}
//   })();
//
// Metro bundles kbach.config.js into the app, so plugins (functions) are
// included and run correctly — the full config is available at runtime.
//
// initConfig() is reference-based: it skips updateConfig() when the same config
// object is passed again (multiple files importing the same cached require result).
// When kbach.config.js changes on disk, Metro's Fast Refresh re-evaluates the
// module and produces a new object reference → initConfig() re-applies the config.
//
// cfgAbsPath MUST use forward slashes — Metro require() does not handle Windows
// backslash paths inside string literals.

function buildConfigInitAST(t, cfgAbsPath) {
  const initCall = t.expressionStatement(
    t.callExpression(
      t.memberExpression(
        t.callExpression(t.identifier('require'), [t.stringLiteral('@kbach/native')]),
        t.identifier('initConfig'),
      ),
      [t.callExpression(t.identifier('require'), [t.stringLiteral(cfgAbsPath)])],
    ),
  );

  const body = t.blockStatement([
    t.tryStatement(
      t.blockStatement([initCall]),
      t.catchClause(t.identifier('_e'), t.blockStatement([])),
    ),
  ]);

  return t.expressionStatement(
    t.callExpression(t.functionExpression(null, [], body), []),
  );
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

module.exports = function kbachBabelPlugin(api, options = {}) {
  const { types: t } = api;

  const {
    configFile = 'kbach.config.js',
    attributes = ['kb', 'className'],
    debug = false,
  } = options;

  // The JSX runtime (jsx-runtime.tsx) only ever reads className/kb/__kbachClasses
  // off props — it has no way to know about a custom `attributes` name configured
  // here, since that option never reaches the runtime. A STATIC string on a custom
  // attribute still works (this plugin resolves and renames it to __kbachClasses
  // at build time), but a DYNAMIC expression (template literal, ternary, computed)
  // on that same custom attribute is left completely untouched by both this plugin
  // (correctly, since it's not a string literal) and the runtime (which never
  // recognizes the original attribute name) — it silently renders unstyled with no
  // error. Surfacing that gap once per build beats leaving it silent.
  const customAttributes = attributes.filter((a) => a !== 'kb' && a !== 'className');
  if (customAttributes.length) {
    warn(
      `Custom class attribute(s) ${customAttributes.map((a) => `"${a}"`).join(', ')} are ` +
      'only resolved for STATIC string classes at build time. A dynamic expression ' +
      '(template literal, ternary, computed value) on them is not recognized by the ' +
      '@kbach/native runtime, which only reads className/kb — it will render unstyled ' +
      'with no warning at runtime. Use className or kb for any dynamic class string.',
    );
  }

  const SEP = path.sep;

  return {
    name: 'babel-plugin-kbach',

    // JSX runtime setup: pre() injects a @jsxImportSource comment so that
    // @babel/plugin-transform-react-jsx (from babel-preset-expo or any React preset)
    // uses @kbach/native/jsx-runtime. Our pre() runs before the preset's pre(), so the
    // comment is in place when the JSX transform reads it.
    //
    // NOTE: Do NOT add plugins dynamically inside manipulateOptions. By the time
    // manipulateOptions runs, opts.presets has already been resolved from strings to
    // functions — preset detection by name is impossible — and pushing a new entry into
    // opts.plugins at that stage produces an uninstantiated plugin with visitor: undefined,
    // which crashes @babel/traverse's visitors.merge().

    pre(file) {
      // Skip node_modules — they have their own JSX runtime and are already compiled
      const filename = file.opts.filename || '';
      if (filename.includes(`${SEP}node_modules${SEP}`)) return;

      // Inject @jsxImportSource so @babel/plugin-transform-react-jsx (from a React preset)
      // uses our runtime. This pre() runs before the preset's pre() calls.
      const comments = file.ast.comments;
      if (!Array.isArray(comments)) return;
      const alreadySet = comments.some(c => /@jsxImportSource|@jsxRuntime/.test(c.value));
      if (!alreadySet) {
        comments.unshift({ type: 'CommentLine', value: ' @jsxImportSource @kbach/native' });
      }
    },

    visitor: {
      Program: {
        enter(programPath, state) {
          state.kbachDeclarations = new Map();
        },

        exit(programPath, state) {
          const hasStaticDeclarations = !!(state.kbachDeclarations && state.kbachDeclarations.size);
          // hasClassAttr is set by the JSXAttribute visitor for ANY matched attribute
          // (kb/className/…), static or dynamic — a file whose only usage is a
          // dynamic class expression (template literal, conditional, computed) never
          // populates kbachDeclarations, but the runtime still resolves those classes
          // dynamically and needs kbach.config.js synced just as much as a file with
          // static classes does. Gating this whole block on kbachDeclarations.size
          // (as before) meant a dynamic-only file — or a dynamic-only app, if no file
          // anywhere has a static class string — never got the config-init call at
          // all, silently leaving dark mode / useColors() / dynamic resolution on the
          // default config instead of the user's kbach.config.js.
          if (!hasStaticDeclarations && !state.hasClassAttr) return;

          const body = programPath.get('body');
          const imports = body.filter(p => p.isImportDeclaration());
          const insertAfterPath = imports.length > 0 ? imports[imports.length - 1] : null;

          const insert = (node) => {
            if (insertAfterPath) insertAfterPath.insertAfter(node);
            else programPath.unshiftContainer('body', node);
          };

          // 1. Inject __kbachStyles declarations (reverse so they appear in order)
          if (hasStaticDeclarations) {
            const entries = [...state.kbachDeclarations.values()];
            for (let i = entries.length - 1; i >= 0; i--) {
              const { uid, astNode } = entries[i];
              insert(t.variableDeclaration('const', [t.variableDeclarator(uid, astNode)]));
            }
          }

          // 2. Inject runtime config init LAST so insertAfter places it FIRST
          //    (right after imports, before the declarations above).
          //    This syncs kbach.config.js into the runtime for dynamic class
          //    resolution, useColors(), and custom darkMode strategy.
          const cfgAbsPath = path.resolve(resolveProjectRoot(state), configFile).replace(/\\/g, '/');
          if (fs.existsSync(cfgAbsPath.replace(/\//g, path.sep))) {
            insert(buildConfigInitAST(t, cfgAbsPath));
          }
        },
      },

      JSXAttribute(nodePath, state) {
        // Skip node_modules entirely — they're already compiled
        const filename = state.file.opts.filename || '';
        if (filename.includes(`${SEP}node_modules${SEP}`)) return;

        const attrName = nodePath.node.name;
        const name = t.isJSXIdentifier(attrName) ? attrName.name : null;

        if (!name || !attributes.includes(name)) return;

        // Mark this file as having class-attribute usage regardless of whether
        // the value turns out to be static or dynamic — see the exit() handler
        // above for why the config-init injection depends on this, not just on
        // whether any static declarations were collected.
        state.hasClassAttr = true;

        const value = nodePath.node.value;

        if (!t.isStringLiteral(value) && !(t.isJSXExpressionContainer(value) && t.isStringLiteral(value.expression))) {
          return;
        }

        const classString = t.isStringLiteral(value)
          ? value.value
          : value.expression.value;

        if (!classString || !classString.trim()) return;

        try {
          // Use global cache to avoid re-resolving the same class string
          // across different files in the same build. Namespaced by the
          // resolved config file path so different projects/configs sharing
          // this worker process never collide (see _resolveCache comment above).
          const projectRoot = resolveProjectRoot(state);
          const cfgAbsPath = path.resolve(projectRoot, configFile);
          const cacheKey = `${cfgAbsPath} ${classString}`;
          let resolved;
          if (_resolveCache.has(cacheKey)) {
            resolved = _resolveCache.get(cacheKey);
          } else {
            const { resolve } = getCore();
            const config = getUserConfig(configFile, projectRoot);
            resolved = resolve(classString, config.theme, config.darkMode);
            _resolveCache.set(cacheKey, resolved);
          }

          // Don't inject __kbachStyles when nothing resolved — this avoids
          // bloating compiled output with {} for pure-unknown or pure-CSS classes.
          const hasStyles = Object.values(resolved).some(
            v => v && typeof v === 'object' && Object.keys(v).length > 0,
          );
          if (!hasStyles) return;

          if (debug) {
            log(`Transformed "${classString}"`);
          }

          let uid;
          if (state.kbachDeclarations.has(classString)) {
            uid = state.kbachDeclarations.get(classString).uid;
          } else {
            const astNode = resolvedStyleToAST(t, resolved);
            uid = nodePath.scope.getProgramParent().generateUidIdentifier('kbach');
            state.kbachDeclarations.set(classString, { uid, astNode });
          }

          nodePath.insertAfter(
            t.jSXAttribute(
              t.jSXIdentifier('__kbachStyles'),
              t.jSXExpressionContainer(t.identifier(uid.name)),
            ),
          );

          nodePath.node.name = t.jSXIdentifier('__kbachClasses');
        } catch (err) {
          if (debug) {
            warn(`Couldn't transform "${classString}": ${err.message}`);
          }
        }
      },
    },
  };
};
