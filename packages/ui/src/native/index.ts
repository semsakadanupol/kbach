// React Native / Expo build-tooling entry point — @kbach/ui/native.
//
// ThemeProvider lives ONLY in the main '@kbach/ui' entry now — it auto-detects
// native at render time (see ThemeProvider.tsx's "Native auto-detection"
// section) instead of needing a separate native-specific wrapper. Importing
// it from here previously risked landing on a different physical module
// instance than the rest of an app reached through '@kbach/ui' (Metro resolves
// the "import"/"require" package.json condition per call site — see
// core/globalSingleton.ts), which silently broke dark:/light: classes or
// isDark depending on which import path won. Removed entirely rather than
// kept as a re-export, since @kbach/ui is still pre-1.0.
//
// Separate from the main index.ts barrel (not re-exported there) because
// setup.ts is Node-only build tooling (Metro/Babel config generators): pulling
// it into the main entry would add dead Node-oriented code to every web
// consumer's bundle. Mirrors how ./vite is already its own subpath.

export { withKbach, withKbachBabel, createKbachConfig } from './setup';
export type { KbachOptions } from './setup';
