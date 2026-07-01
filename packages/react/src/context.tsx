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
