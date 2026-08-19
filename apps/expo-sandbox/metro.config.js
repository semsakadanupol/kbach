// Learn more https://docs.expo.dev/guides/monorepos
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// @kbach/react-native is linked in via a `file:` dependency to
// packages/react-native, which lives outside this app's own root — Metro
// only serves files under its watched roots, so the workspace root must be
// watched explicitly (same requirement as apps/native-sandbox/metro.config.js).
config.watchFolders = [workspaceRoot];

// packages/react-native has no react/react-native of its own installed, so
// Metro's hierarchical node_modules lookup for its own `import ... from
// 'react-native'` walks up to the *repo root*'s node_modules — a different
// physical install (different module/object identity) than the one this
// app's own files resolve to. Code that compares an imported reference for
// identity (e.g. jsx-runtime's `type === Pressable` check) silently breaks
// across the two instances. Force both to this app's single copy — see
// apps/native-sandbox/metro.config.js for the full root-cause writeup.
const forcedSingleInstance = {
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
  react: path.resolve(projectRoot, 'node_modules/react'),
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (Object.prototype.hasOwnProperty.call(forcedSingleInstance, moduleName)) {
    return { type: 'sourceFile', filePath: require.resolve(forcedSingleInstance[moduleName]) };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
