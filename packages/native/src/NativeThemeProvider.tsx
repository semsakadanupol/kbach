import React from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { ThemeProvider, type ThemeProviderProps } from '@kbach/react';

/**
 * Native-aware ThemeProvider. Wraps the base ThemeProvider and automatically
 * passes the system color scheme from React Native's useColorScheme() hook.
 *
 * This fixes Android startup dark mode detection: Appearance.getColorScheme()
 * can cache null if the device was already dark at launch (the appearanceChanged
 * event only fires on *changes*). useColorScheme() called here with a proper
 * hook name ensures the React Compiler and all linters handle it correctly, and
 * useSyncExternalStore inside the hook properly subscribes to Appearance events.
 *
 * Exported as `ThemeProvider` from @kbach/native — no API change for users.
 */
export function NativeThemeProvider(props: ThemeProviderProps): React.JSX.Element {
  const raw = useColorScheme();
  const { width } = useWindowDimensions();
  const systemColorScheme: 'light' | 'dark' | null =
    raw === 'dark' ? 'dark' : raw === 'light' ? 'light' : null;
  return (
    <ThemeProvider
      {...props}
      colorScheme={props.colorScheme ?? systemColorScheme}
      windowWidth={props.windowWidth ?? width}
    />
  );
}
