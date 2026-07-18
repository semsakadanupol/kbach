/**
 * Metro and Babel setup helpers for React Native / Expo projects.
 *
 * All three functions are meant to be called from Node.js config files
 * (metro.config.js, babel.config.js). They are safe to import in React
 * Native bundles but will never execute there.
 */

// This file only runs inside Node.js build tooling, but this package's
// tsconfig has no @types/node (kept minimal for the RN app bundle), so
// `process`/`node:process` aren't typed here. A minimal local ambient
// declaration for just what's used below avoids pulling in the full
// @types/node dependency for one warning helper.
declare const process: { stdout?: { isTTY?: boolean }; env: Record<string, string | undefined> };

export interface KbachOptions {
  /** Path to kbach.config.js, relative to project root. Default: 'kbach.config.js' */
  configFile?: string;
  /** JSX attribute names to transform at build time. Default: ['kb', 'className'] */
  attributes?: string[];
  /** Log transformed class strings to the Metro console. Default: false */
  debug?: boolean;
}

// ─── Terminal color helper ──────────────────────────────────────────────────────
// Plain ANSI escapes — no-ops when stdout isn't a color-capable TTY (CI logs,
// redirected output) or NO_COLOR is set.
function warn(message: string): void {
  const useColor = !!process.stdout?.isTTY && !process.env.NO_COLOR;
  const paint = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
  console.warn(`${paint('1', paint('35', '[kbach]'))} ${paint('33', message)}`);
}

// ─── withKbach ────────────────────────────────────────────────────────────────

/**
 * Inject the Kbach Babel plugin into a Metro transformer config.
 *
 * metro.config.js (Expo):
 * ```js
 * const { getDefaultConfig } = require('expo/metro-config');
 * const { withKbach } = require('@kbach/native');
 * const config = getDefaultConfig(__dirname);
 * module.exports = withKbach(config);
 * ```
 *
 * metro.config.js (bare React Native):
 * ```js
 * const { getDefaultConfig } = require('@react-native/metro-config');
 * const { withKbach } = require('@kbach/native');
 * const config = getDefaultConfig(__dirname);
 * module.exports = withKbach(config);
 * ```
 */
export function withKbach(
  metroConfig: Record<string, any>,
  _options: KbachOptions = {},
): Record<string, any> {
  // No-op: Kbach is configured entirely through babel.config.js via
  // createKbachConfig() or withKbachBabel(). Modifying the Metro transformer
  // config is not required and causes bundler initialisation failures in
  // Expo SDK 52+. This function is kept for backwards-compat only.
  return metroConfig;
}

// ─── withKbachBabel ───────────────────────────────────────────────────────────

/**
 * Add the Kbach preset to an existing Babel config.
 * Use this when you have a custom babel.config.js and want to keep it.
 *
 * babel.config.js:
 * ```js
 * const { withKbachBabel } = require('@kbach/native');
 * module.exports = withKbachBabel({
 *   presets: ['babel-preset-expo'],
 * });
 * ```
 */
export function withKbachBabel(
  babelConfig: Record<string, any>,
  options: KbachOptions = {},
): Record<string, any> {
  const {
    configFile = 'kbach.config.js',
    attributes = ['kb', 'className'],
    debug = false,
  } = options;

  // Patch jsxImportSource onto babel-preset-expo / @babel/preset-react
  const presets = (babelConfig.presets ?? []).map((preset: unknown) => {
    const [name, presetOpts = {}] = Array.isArray(preset) ? preset : [preset, {}];
    if (
      typeof name === 'string' &&
      (name.includes('babel-preset-expo') || name.includes('preset-react'))
    ) {
      const opts = presetOpts as Record<string, unknown>;
      // Kbach requires the automatic JSX runtime to intercept className props.
      // An explicit jsxRuntime: 'classic' would otherwise silently make every
      // Kbach class a no-op (className never routes through our runtime) with
      // no build error, so force it and warn instead of failing silently.
      // (This file only runs inside Node.js build tooling, never in the app
      // bundle, so the warning is unconditional — no process.env gating needed.)
      if (opts.jsxRuntime === 'classic') {
        warn(`Forcing jsxRuntime "automatic" on ${name} (was "classic") — required for Kbach`);
      }
      return [name, { ...opts, jsxRuntime: 'automatic', jsxImportSource: '@kbach/native' }];
    }
    return preset;
  });

  // Append kbach preset last — presets run in reverse order, so this runs first
  return {
    ...babelConfig,
    presets: [...presets, ['@kbach/native/babel', { configFile, attributes, debug }]],
  };
}

// ─── createKbachConfig ────────────────────────────────────────────────────────

/**
 * Generate a complete Babel config for Expo projects.
 * This is the recommended one-liner for new projects.
 *
 * babel.config.js:
 * ```js
 * const { createKbachConfig } = require('@kbach/native');
 * module.exports = createKbachConfig();
 * ```
 *
 * Or written manually (identical to NativeWind's config shape):
 * ```js
 * module.exports = function(api) {
 *   api.cache(true);
 *   return {
 *     presets: [
 *       ['babel-preset-expo', { jsxImportSource: '@kbach/native' }],
 *       '@kbach/native/babel',
 *     ],
 *   };
 * };
 * ```
 */
export function createKbachConfig(options: KbachOptions = {}): Record<string, unknown> {
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: '@kbach/native' }],
      ['@kbach/native/babel', {
        configFile: options.configFile ?? 'kbach.config.js',
        attributes: options.attributes ?? ['kb', 'className'],
        debug: options.debug ?? false,
      }],
    ],
  };
}
