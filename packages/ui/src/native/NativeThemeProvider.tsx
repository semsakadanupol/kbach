import React from 'react';
// Type-only — erased at compile time, doesn't affect what gets bundled.
import type { ThemeProviderProps } from '../ThemeProvider';

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
 * Exported as `ThemeProvider` from @kbach/ui/native — no API change for
 * existing @kbach/native users (that package now re-exports this).
 *
 * `react-native` is required here lazily (inside the function body) rather
 * than via a top-level `import`. native/index.ts bundles this file together
 * with setup.ts's Node-only helpers (createKbachConfig, withKbach,
 * withKbachBabel), which babel.config.js loads by calling
 * `require('@kbach/ui/native')` in a plain Node.js process — no Metro, no
 * Babel/Flow transform for react-native's own source. A top-level import
 * would make Node eagerly require the real `react-native` package just to
 * read createKbachConfig off the module, which crashes immediately
 * (react-native's entry point isn't valid plain-Node JS). A require() inside
 * the function body only ever runs when NativeThemeProvider actually renders
 * — i.e. inside the real Metro/Hermes runtime, where require() is always
 * available and react-native loads fine.
 *
 * This is also why the "./native" export has no separate ESM entry: tsup/
 * esbuild can't emit a real `require()` inside ESM output — it rewrites it to
 * a `__require` shim (`typeof require !== "undefined" ? require : …`). That
 * shim still resolves to Metro's real require function at runtime, but
 * Metro's bundler only registers a module's dependencies by statically
 * finding literal `require("name")` calls in its source — `__require(...)`
 * doesn't match, so "react-native" is never added to the compiled module's
 * dependency map and Metro throws "Requiring unknown module" at runtime. The
 * CJS build's plain `require('react-native')` call doesn't have this
 * problem, so both "import" and "require" conditions point at dist/native.js.
 *
 * '@kbach/ui' itself is required the same lazy way, for a different
 * reason: this file is bundled into its own dist/native.js (see
 * tsup.config.ts), separate from dist/index.js/.mjs. A top-level `import`
 * would make esbuild inline a SECOND, independent copy of
 * ThemeProvider.tsx/context.tsx (its own createContext() call) into
 * dist/native.js, splitting ThemeContext between "@kbach/ui" and
 * "@kbach/ui/native" consumers — require('@kbach/ui') instead resolves
 * through Node/npm workspaces' self-reference and tsup's default of treating
 * anything outside the entry's own source tree as external, reaching the
 * exact same dist/index.js instance every other consumer gets (verified by
 * building and grepping dist/native.js for a literal require("@kbach/ui")
 * rather than an inlined copy). `typeof import(...)` for the type would hit
 * the same self-reference resolution tsup's DTS step can't handle during its
 * own package's build (unlike esbuild's JS bundling, which resolves it
 * fine) — so the type comes from the relative ThemeProviderProps import
 * above instead, and ThemeProvider itself is cast to match.
 */
export function NativeThemeProvider(props: ThemeProviderProps): React.JSX.Element {
  const { useColorScheme, useWindowDimensions } = require('react-native') as typeof import('react-native');
  const { ThemeProvider } = require('@kbach/ui') as {
    ThemeProvider: React.ComponentType<ThemeProviderProps>;
  };
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
