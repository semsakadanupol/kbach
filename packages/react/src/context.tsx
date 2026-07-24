import { createContext, useContext } from 'react';
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

// package.json's "." export deliberately points BOTH the "import" and
// "require" conditions at the same dist/index.js. Metro picks the "import" vs
// "require" condition per individual call site (based on whether that
// specific line used `import` or `require()`, not one choice for the whole
// bundle) — so a dual ESM/CJS build would give <ThemeProvider> (reached via
// @kbach/native's CJS require()) and a component's own `import { useTheme }
// from '@kbach/react'` two DIFFERENT copies of this module, each with its own
// createContext() call. useTheme() would then read a Context that no
// Provider in the tree ever writes to, throwing this hook's "must be called
// inside a <ThemeProvider>" error even with a <ThemeProvider> correctly
// wrapping the app root. Web bundlers (Vite) don't have this per-call-site
// split, so this only costs @kbach/react's web build some ESM tree-shaking —
// a fine trade for React Native not silently getting two Contexts.
export const ThemeContext = createContext<ThemeContextValue | null>(null);

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
