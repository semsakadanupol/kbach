import { createContext, useContext } from 'react';
import type { Context } from 'react';
import type { ThemeMode, ResolvedConfig } from './core';

export interface ThemeContextValue {
  /** The user-selected mode ('light' | 'dark' | 'system') */
  mode: ThemeMode;
  /** The effective resolved mode (never 'system') */
  resolvedMode: 'light' | 'dark';
  /** Convenience boolean */
  isDark: boolean;
  /** Change the theme mode programmatically */
  setMode: (mode: ThemeMode) => void;
  /** Toggle between light and dark (ignores system) */
  toggle: () => void;
  /** The fully resolved framework config (theme values, darkMode strategy, etc.) */
  config: ResolvedConfig;
}

// package.json's "." export keeps a REAL dual ESM/CJS build (separate
// dist/index.mjs and dist/index.js) — required for Vite/Rollup web builds,
// which need genuine ESM to statically detect named exports; a CJS-only
// build broke apps/docs's real `vite build` (Rollup's static CJS-named-export
// detection isn't reliable on esbuild-emitted CJS — see RULES.md rule 7).
//
// Confirmed (not just theoretical) on Metro: Metro's web target resolves the
// "import" vs "require" package.json condition per individual call site, so
// an app that writes `import { useTheme } from '@kbach/ui'` directly
// (dist/index.mjs) alongside `<ThemeProvider>` from `@kbach/ui/native`
// (which reaches this package via a real `require('@kbach/ui')` —
// dist/index.js) got two DIFFERENT createContext() instances — verified by
// exporting a real Expo Web bundle and running it: useTheme() threw "must be
// called inside a <ThemeProvider>" even with one correctly mounted. Two
// bundlers with directly conflicting requirements (Rollup needs real ESM;
// Metro needs one physical file) rules out a "make them the same module"
// fix — so this Context specifically falls back to the globalThis-keyed
// singleton this codebase used everywhere before core/ became its own
// shared build entry (see darkModeStore.ts's header comment for that
// history) — RULES.md rule 3's documented-and-necessary exception. Every
// duplicated copy of this module reads/creates the same Context object
// here, so <ThemeProvider>/useTheme() interoperate regardless of which
// physical file either one loaded through.
declare global {
  // eslint-disable-next-line no-var
  var __kbachThemeContext: Context<ThemeContextValue | null> | undefined;
}

export const ThemeContext: Context<ThemeContextValue | null> =
  globalThis.__kbachThemeContext ??
  (globalThis.__kbachThemeContext = createContext<ThemeContextValue | null>(null));

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      '[Kbach] useTheme() must be called inside a <ThemeProvider>. ' +
      'Wrap your app root with <ThemeProvider>.',
    );
  }
  return ctx;
}

export function useIsDark(): boolean {
  return useTheme().isDark;
}
