import { createContext, useContext } from 'react';
import type { ThemeMode } from './darkModeStore';

export interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

// Plain `createContext` (unlike old-kbach's `getGlobalSingleton()`-backed
// version) — that indirection existed there to guard against a dual ESM/CJS
// build producing two different Context instances across bundlers
// (confirmed live bug on Metro). This package ships ESM/CJS from the same
// tsup build with a single Context module, so that failure mode doesn't
// apply here; adding the indirection anyway would be solving a problem
// this package doesn't have.
export const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Requires a `<ThemeProvider>` ancestor — throws otherwise, since a
 * component that destructures `{ mode, setMode }` genuinely needs Context
 * (unlike a component that just wants the dark/light boolean, which should
 * reach for `useGlobalDarkMode()` instead and never needs a provider at
 * all).
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      'useTheme() must be called within a <ThemeProvider>. ' +
        'For dark-mode state without a provider, use useGlobalDarkMode() (read) or toggleGlobalDarkMode()/setGlobalThemeMode() (write) from "@kbach/react" instead.',
    );
  }
  return ctx;
}
