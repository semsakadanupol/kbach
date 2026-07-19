// Context & hook
export { ThemeContext, useTheme, useIsDark } from './context';
export type { ThemeContextValue } from './context';

export { useColors, wrapColors } from './useColors';
export type { ColorsAPI, ColorScale } from './useColors';

// Provider
export { ThemeProvider } from './ThemeProvider';
export type { ThemeProviderProps } from './ThemeProvider';

// Base browser-default reset as a renderable <style> tag — see KbachReset.tsx
export { KbachReset } from './KbachReset';

// styled() HOC
export { styled } from './styled';
export type { StyledProps } from './styled';

// Hooks
export { useStyles, useResolvedStyle } from './useStyles';
export type { InteractionState } from './useStyles';

// Global dark-mode store hook (works without ThemeContext — used by jsx-runtime)
export { useGlobalDarkMode } from './useGlobalDarkMode';

// Responsive hooks
export { useBreakpoint, useResponsive } from './useBreakpoint';

// InteractiveWrapper (advanced use — normally used automatically by jsx-runtime)
export { InteractiveWrapper } from './InteractiveWrapper';
export type { InteractiveWrapperProps } from './InteractiveWrapper';

// Utilities
export { kb, cx } from './kb';

// Web element substitution — register RN components → HTML tags for clean DOM output
export { registerWebElement } from './web-substitute';

// Core functions — re-exported so users never need to install @kbach/core directly
export {
  resolve,
  flatten,
  updateConfig,
  initConfig,
  getConfig,
  buildConfig,
  clearCache,
  defaultTheme,
  defaultColors,
  parseClass,
  parseClasses,
  splitClassTokens,
  normalizeClassString,
  disableRuntimeCSS,
  setResolveTarget,
} from './core';

export type {
  ThemeMode,
  StyleValue,
  ResolvedStyle,
  ThemeConfig,
  FrameworkConfig,
  ResolvedConfig,
  ParsedClass,
  PluginAPI,
} from './core';
