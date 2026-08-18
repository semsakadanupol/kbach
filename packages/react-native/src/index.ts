export { setTheme, getTheme, defaultTheme } from './theme';
export type { ThemeConfig, ColorEntry, ContainerConfig } from './theme';
export { resolveStyle } from './nativeBridge';
export type { StyleObject } from './nativeBridge';

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
