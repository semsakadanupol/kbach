const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * This app is deliberately excluded from the root npm workspace (Phase 5 —
 * hoisting broke RN's Gradle tooling), so `@kbach/react-native` is linked
 * into node_modules via a plain `file:` dependency (an NTFS junction on
 * Windows). Metro's file index only contains files under its watched roots
 * (projectRoot + watchFolders) — it won't serve a file by path even if it
 * exists on disk when that path falls outside those roots. That breaks two
 * things at once here: the junction target itself (packages/react-native)
 * isn't traversed, and packages/react-native's own dependencies (e.g.
 * @babel/runtime, hoisted to the repo root node_modules) aren't visible
 * either. Watching the whole monorepo root covers both.
 *
 * That same exclusion causes a second, subtler problem (Phase 12):
 * `packages/react-native` has no `react-native` of its own installed, so
 * Metro's hierarchical node_modules lookup for its `import { Pressable }
 * from 'react-native'` walks up past it to the *repo root*'s
 * node_modules/react-native — a different physical install (and thus a
 * different module instance / object identity) than this app's own
 * node_modules/react-native, which every file *inside* apps/native-sandbox
 * (like App.tsx) resolves to instead. Code that only uses react-native's
 * plain exports (components, hooks) never notices the duplicate. Code that
 * compares an imported reference for identity — jsx-runtime.tsx's
 * `type === Pressable` check — silently and permanently fails, since the
 * two sides are two different `Pressable` functions.
 *
 * `extraNodeModules` does NOT fix this — it's a fallback consulted only
 * when normal hierarchical lookup fails to find a module at all, and since
 * the repo-root copy genuinely exists, hierarchical lookup always succeeds
 * first and extraNodeModules is never even reached. `resolver.resolveRequest`
 * is the actual override mechanism: it intercepts resolution before the
 * default algorithm runs, forcing 'react-native'/'react' to this app's one
 * copy unconditionally, regardless of which directory is importing them.
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const forcedSingleInstance = {
  'react-native': path.resolve(__dirname, 'node_modules/react-native'),
  react: path.resolve(__dirname, 'node_modules/react'),
};

const config = {
  watchFolders: [path.resolve(__dirname, '../..')],
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (Object.prototype.hasOwnProperty.call(forcedSingleInstance, moduleName)) {
        return { type: 'sourceFile', filePath: require.resolve(forcedSingleInstance[moduleName]) };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
