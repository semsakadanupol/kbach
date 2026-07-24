import React from 'react';
import { ThemeProvider, type ThemeProviderProps } from '@kbach/react';

// This file only runs inside Node.js build tooling, but this package's
// tsconfig has no @types/node (kept minimal for the RN app bundle) — see
// setup.ts for the same pattern with `process`.
declare const require: (id: string) => any;

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
 *
 * `react-native` is required here lazily (inside the function body) rather
 * than via a top-level `import`. index.ts bundles this file together with
 * setup.ts's Node-only helpers (createKbachConfig, withKbach, withKbachBabel),
 * which babel.config.js loads by calling `require('@kbach/native')` in a
 * plain Node.js process — no Metro, no Babel/Flow transform for react-native's
 * own source. A top-level import would make Node eagerly require the real
 * `react-native` package just to read createKbachConfig off the module,
 * which crashes immediately (react-native's entry point isn't valid plain-Node
 * JS). A require() inside the function body only ever runs when
 * NativeThemeProvider actually renders — i.e. inside the real Metro/Hermes
 * runtime, where require() is always available and react-native loads fine.
 *
 * This is also why package.json's "." export has no separate ESM entry:
 * tsup/esbuild can't emit a real `require()` inside ESM output — it rewrites
 * it to a `__require` shim (`typeof require !== "undefined" ? require : …`).
 * That shim still resolves to Metro's real require function at runtime, but
 * Metro's bundler only registers a module's dependencies by statically
 * finding literal `require("name")` calls in its source — `__require(...)`
 * doesn't match, so "react-native" is never added to the compiled module's
 * dependency map and Metro throws "Requiring unknown module" at runtime. The
 * CJS build's plain `require('react-native')` call doesn't have this
 * problem, so both "import" and "require" conditions point at dist/index.js.
 */
export function NativeThemeProvider(props: ThemeProviderProps): React.JSX.Element {
  const { useColorScheme, useWindowDimensions } = require('react-native') as typeof import('react-native');
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
