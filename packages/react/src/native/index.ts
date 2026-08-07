// React Native / Expo entry point — @kbach/react/native.
//
// Separate from the main index.ts barrel (not re-exported there) because
// setup.ts is Node-only build tooling (Metro/Babel config generators): pulling
// it into the main entry would add dead Node-oriented code to every web
// consumer's bundle. Mirrors how ./vite is already its own subpath.

export { NativeThemeProvider as ThemeProvider } from './NativeThemeProvider';
export { withKbach, withKbachBabel, createKbachConfig } from './setup';
export type { KbachOptions } from './setup';
