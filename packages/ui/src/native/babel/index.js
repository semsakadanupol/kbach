'use strict';

/**
 * @kbach/ui/babel — Babel preset (NativeWind-style).
 *
 * babel.config.js:
 * ```js
 * module.exports = function(api) {
 *   api.cache(true);
 *   return {
 *     presets: [
 *       'babel-preset-expo',
 *       '@kbach/ui/babel',
 *     ],
 *   };
 * };
 * ```
 *
 * Presets run in reverse order, so this preset's plugin runs BEFORE
 * babel-preset-expo's JSX transform — which is the correct ordering:
 * kbach renames className/tw attributes first, then the JSX transform
 * compiles JSX using @kbach/ui/jsx-runtime.
 */
module.exports = function kbachBabelPreset(api, options = {}) {
  return {
    plugins: [
      [require('../babel-plugin'), options],
    ],
  };
};
