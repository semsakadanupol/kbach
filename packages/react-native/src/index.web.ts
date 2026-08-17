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
