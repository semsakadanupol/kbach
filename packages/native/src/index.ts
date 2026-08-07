// @kbach/native is deprecated — its implementation (NativeThemeProvider,
// the Babel plugin/preset, Metro/Babel setup helpers) has moved into
// @kbach/react itself (see @kbach/react/native, @kbach/react/babel). This
// package now only re-exports @kbach/react so existing installs keep working
// with zero code changes — see RULES.md rule 4 (never break the public API
// silently). New projects should install @kbach/react directly.

// React components, hooks, and utilities — everything from @kbach/react
export * from '@kbach/react';

// ThemeProvider re-exported from @kbach/react/native's NativeThemeProvider,
// which wraps the base ThemeProvider with useColorScheme() for reliable
// Android/iOS dark mode. This explicit export shadows the ThemeProvider from
// `export * from '@kbach/react'` above.
export { ThemeProvider } from '@kbach/react/native';

// Metro / Babel setup — called from metro.config.js and babel.config.js
export { withKbach, withKbachBabel, createKbachConfig } from '@kbach/react/native';
export type { KbachOptions } from '@kbach/react/native';

if (process.env.NODE_ENV !== 'production') {
  console.warn(
    '[kbach] @kbach/native is deprecated. Its React Native/Expo support has moved into ' +
    '@kbach/react itself — install @kbach/react instead (ThemeProvider from ' +
    '"@kbach/react/native", the Babel preset from "@kbach/react/babel"). This package will ' +
    'keep working as a compatibility shim, but won\'t receive new features.',
  );
}
