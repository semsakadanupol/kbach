export type {
  Platform,
  ThemeMode,
  StyleValue,
  ParsedClass,
  ResolvedStyle,
  ColorShades,
  ThemeColors,
  ThemeSpacing,
  ThemeConfig,
  FrameworkConfig,
  ResolvedConfig,
  PluginAPI,
  DarkMode,
} from './types';

export { defaultTheme, defaultColors } from './theme';
export { LRUCache } from './cache';
export { isWeb, isNative, toNativeValue, escapeCSSSelector } from './platform';
export { parseClass, parseClasses, splitClassTokens, normalizeClassString } from './parser';
export {
  registerModifier,
  clearPluginModifiers,
  getModifier,
  getAllModifierNames,
  getInteractiveModifiers,
  getModeModifiers,
  getResponsiveModifiers,
  matchModifier,
  isKnownModifier,
} from './registry';
export { resolveUtility, resolveColor, resolveSpacing, resolveSizing, getBuiltinUtilityPrefixes, getBuiltinStandaloneNames, isKnownUtility } from './utilities';
export { resolve, flatten, clearCache, getDefaultFontFamily, generateClassCSS, setDefaultFontFamily, disableRuntimeCSS, isRuntimeCSSDisabled } from './resolver';
export {
  getConfig,
  resetConfig,
  buildConfig,
  updateConfig,
  initConfig,
  onConfigChange,
  customVariants,
} from './config';

export {
  syncGlobalDarkMode,
  setGlobalDarkMode,
  getGlobalDarkMode,
  subscribeGlobalDarkMode,
} from './darkModeStore';

export {
  syncGlobalWidth,
  syncGlobalScreens,
  setGlobalWidth,
  getGlobalWidth,
  getGlobalScreens,
  subscribeGlobalWidth,
  getActiveBreakpoints,
} from './responsiveStore';
