export { setTheme, getTheme, defaultTheme } from './theme';
export type { ThemeConfig } from './theme';
export { resolveStyle } from './nativeBridge';
export type { StyleObject } from './nativeBridge';

// Dark mode: standalone (no provider needed) — see darkModeStore.ts.
export {
  getGlobalDarkMode,
  getGlobalThemeMode,
  setGlobalThemeMode,
  toggleGlobalDarkMode,
  subscribeGlobalDarkMode,
} from './darkModeStore';
export type { ThemeMode } from './darkModeStore';
export { useGlobalDarkMode } from './useGlobalDarkMode';

// Dark mode: optional React Context wrapper around the same global store.
export { ThemeProvider } from './ThemeProvider';
export type { ThemeProviderProps } from './ThemeProvider';
export { useTheme } from './ThemeContext';
export type { ThemeContextValue } from './ThemeContext';
