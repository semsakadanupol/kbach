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
export type { ThemeProviderProps, ThemeStorageAdapter } from './ThemeProvider';
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

// Dynamic tokens: the native counterpart to a real CSS custom property —
// `var(--name)` used directly in a `className` already works on Expo Web
// via real CSS with zero help from this file; these exist so the SAME
// className works on native too, and so JS can both write a token
// (`setDynamicToken`) and read one back reactively (`useDynamicToken`).
export { setDynamicToken, getDynamicToken, deleteDynamicToken, subscribeDynamicTokens } from './dynamicTokens';
export { useDynamicToken } from './useDynamicToken';

// clsx — a plain, platform-agnostic utility with nothing native-specific
// about it, shared with @kbach/react rather than duplicated (see
// @kbach/core's own doc comment). Bundled directly into this package's own
// dist output (not left as an external runtime dependency), so installing
// @kbach/react-native alone is enough — no separate @kbach/core install
// needed.
export { clsx } from '@kbach/core';
export type { ClassValue, ClassDictionary, ClassArray } from '@kbach/core';
