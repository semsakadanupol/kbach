export { initKbach, isKbachReady } from './wasmLoader';
export { kb, disableRuntimeCSS, isRuntimeCSSDisabled } from './kb';
export { setTheme, getTheme, defaultTheme } from './theme';
export type { ThemeConfig, ColorEntry, ContainerConfig, DarkModeStrategy } from './theme';
export { KbachReset } from './KbachReset';

export { resolveKbachConfig, applyKbachConfig } from './config';
export type { KbachConfig } from './config';

// Dark mode: `useTheme()` is the one hook — works anywhere, with or
// without a `<ThemeProvider>` mounted, since it reads darkModeStore.ts's
// global store directly. The raw store functions below remain exported
// for non-React usage (event handlers, plain scripts) — anything that
// isn't a React component and can't call a hook.
export { useTheme } from './useTheme';
export type { ThemeState } from './useTheme';
export { ThemeProvider } from './ThemeProvider';
export type { ThemeProviderProps } from './ThemeProvider';
export {
  getGlobalDarkMode,
  getGlobalThemeMode,
  setGlobalThemeMode,
  toggleGlobalDarkMode,
  subscribeGlobalDarkMode,
} from './darkModeStore';
export type { ThemeMode } from './darkModeStore';

export { useColors } from './useColors';
export type { ColorsAPI, ColorScale } from './useColors';

// clsx — a plain, platform-agnostic utility with nothing React-specific
// about it, shared with @kbach/react-native rather than duplicated (see
// @kbach/core's own doc comment). Bundled directly into this package's own
// dist output (not left as an external runtime dependency), so installing
// @kbach/react alone is enough — no separate @kbach/core install needed.
export { clsx } from '@kbach/core';
export type { ClassValue, ClassDictionary, ClassArray } from '@kbach/core';
