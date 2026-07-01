// React components, hooks, and utilities — everything from @kbach/react
export * from '@kbach/react';

// ThemeProvider re-exported from NativeThemeProvider, which wraps the base
// ThemeProvider with useColorScheme() for reliable Android/iOS dark mode.
// This explicit export shadows the ThemeProvider from `export * from '@kbach/react'`.
export { NativeThemeProvider as ThemeProvider } from './NativeThemeProvider';

// Metro / Babel setup — called from metro.config.js and babel.config.js
export { withKbach, withKbachBabel, createKbachConfig } from './setup';
export type { KbachOptions } from './setup';
