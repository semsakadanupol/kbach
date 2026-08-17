/**
 * @kbach/react-native — Expo Web / react-native-web entry. Metro
 * auto-selects this over index.ts's `resolveStyle`/`StyleObject`
 * re-export when bundling for `web` — see jsx-runtime.web.tsx's doc
 * comment for why. Everything else here (theme, dark mode) is genuinely
 * platform-agnostic — react-native-web already shims Appearance
 * correctly — so it's duplicated verbatim from index.ts rather than
 * factored out: these are plain re-export statements with nothing to
 * diverge on, not logic worth a shared module for.
 *
 * Exports `resolveClassName` here, NOT `resolveStyle`/`StyleObject` (what
 * index.ts exports for native) — a genuinely different public surface on
 * web, matching nativeBridge.web.ts's own resolution strategy (real CSS +
 * `dataSet`, not a resolved style object) — see that file's own doc
 * comment for why.
 */
export { setTheme, getTheme, defaultTheme } from './theme';
export type { ThemeConfig } from './theme';
export { resolveClassName } from './nativeBridge.web';

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
