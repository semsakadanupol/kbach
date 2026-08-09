// No `@vitest-environment jsdom` pragma — plain Node gives isWeb=false,
// isNative=false, genuinely matching SSR (no real `window`/`document`).
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './context';
import { getGlobalWidth } from './core';

// Regression coverage for a fixed SSR/hydration bug: ThemeProvider computed
// `systemScheme` by branching on raw `isWeb` — true in the browser, false
// both on a real native device AND during Node.js SSR of a React Native Web
// app. SSR (isWeb false) read the `colorScheme` PROP (from RN's
// useColorScheme(), passed by NativeThemeProvider), while the browser's very
// first hydration render (isWeb true) immediately switched to reading
// `webScheme` (a useSyncExternalStore value whose OWN server snapshot is
// hardcoded 'light') instead — two different variables, not just two
// snapshots of the same store. If `colorScheme` ever differed from 'light'
// during SSR, that was a genuine cross-render mismatch. Fixed to branch on
// getEffectiveIsWeb() (true in both the browser and Node SSR) so SSR always
// takes the SAME branch (webScheme) the client's first hydration pass does.

function Probe() {
  const { resolvedMode, isDark } = useTheme();
  return React.createElement('span', { 'data-testid': 'resolved' }, `${resolvedMode}:${isDark}`);
}

describe('ThemeProvider SSR — system scheme branch matches the client hydration branch', () => {
  it('ignores a native `colorScheme` prop during SSR and uses the (SSR-safe) web system-scheme path instead', () => {
    // Before the fix: raw `isWeb` is false here (Node, no window), so this
    // rendered using colorScheme="dark" directly, giving resolvedMode="dark".
    // After the fix: getEffectiveIsWeb() is true here too, so this uses
    // webScheme's own server snapshot ('light') instead — matching exactly
    // what the browser's first hydration pass will also compute.
    const html = renderToStaticMarkup(
      React.createElement(ThemeProvider, {
        config: { darkMode: 'attribute' },
        defaultMode: 'system',
        colorScheme: 'dark',
        disablePersistence: true,
        children: React.createElement(Probe),
      }),
    );
    expect(html).toContain('light:false');
    expect(html).not.toContain('dark:true');
  });

  // Regression coverage for a fixed bug in the same family: `windowWidth`
  // (from NativeThemeProvider, always populated via React Native's
  // useWindowDimensions() — never undefined) used to win outright via
  // `windowWidthProp ?? (isWeb ? webWidth : 0)`, completely bypassing the
  // careful "start at 0, correct once mounted" webWidth dance that exists
  // specifically to keep SSR and client hydration in sync. Under React
  // Native Web SSR, useWindowDimensions() has no real viewport to read and
  // returns some SSR default that can't match the real browser width the
  // client sees post-hydration — a genuine responsive-spacing hydration bug.
  it('ignores a native `windowWidth` prop during SSR and uses the SSR-safe 0-width default instead', () => {
    renderToStaticMarkup(
      React.createElement(ThemeProvider, {
        config: { darkMode: 'attribute' },
        defaultMode: 'light',
        // Stands in for NativeThemeProvider's useWindowDimensions() reporting
        // some real device/SSR-default width, e.g. 999 — before the fix this
        // would win outright and get synced to the global width store.
        windowWidth: 999,
        disablePersistence: true,
        children: React.createElement('div'),
      }),
    );
    expect(getGlobalWidth()).toBe(0);
  });
});
