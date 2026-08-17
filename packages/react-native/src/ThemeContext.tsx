import { createContext, useContext } from 'react';
import type { ThemeMode } from './darkModeStore';

export interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

// Plain `createContext` — see @kbach/react's identical file for why the
// old-kbach `getGlobalSingleton()` indirection isn't needed here either
// (single ESM/CJS build from one Context module, same reasoning applies).
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
        'For dark-mode state without a provider, use useGlobalDarkMode() (read) or toggleGlobalDarkMode()/setGlobalThemeMode() (write) from "@kbach/react-native" instead.',
    );
  }
  return ctx;
}
