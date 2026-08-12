'use strict';

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
 * nativeBridge.ts), so this plugin's only job is the pragma injection.
 */
module.exports = function kbachReactNativeBabelPlugin() {
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
    },
    visitor: {},
  };
};
