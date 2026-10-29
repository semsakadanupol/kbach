import { describe, it, expect, afterEach, vi } from 'vitest';
import { defaultTheme, setTheme, getTheme, getThemeJson } from './theme';

describe('setTheme', () => {
  afterEach(() => {
    setTheme(defaultTheme);
  });

  it('keeps the SAME object reference across a call with content-identical data', () => {
    // Regression test: babel-plugin.js injects applyKbachConfig() at the
    // top of every user file, so it re-runs on every file Metro
    // re-executes — a plain unconditional reassignment here handed every
    // one of those redundant calls a brand-new object even when nothing
    // actually changed, which is what made an unrelated Fast Refresh
    // touch every useColors()/reactive-element consumer in the app.
    setTheme({ ...defaultTheme });
    const first = getTheme();
    setTheme({ ...defaultTheme });
    const second = getTheme();
    expect(second).toBe(first);
  });

  it('does replace the reference when the content actually differs', () => {
    setTheme(defaultTheme);
    const first = getTheme();
    setTheme({ ...defaultTheme, darkMode: 'class' });
    const second = getTheme();
    expect(second).not.toBe(first);
    expect(second.darkMode).toBe('class');
  });

  it('keeps getThemeJson() in sync only when the theme actually changes', () => {
    setTheme(defaultTheme);
    const firstJson = getThemeJson();
    setTheme({ ...defaultTheme });
    expect(getThemeJson()).toBe(firstJson);
    setTheme({ ...defaultTheme, darkMode: 'class' });
    expect(getThemeJson()).not.toBe(firstJson);
  });

  it('shares state across two SEPARATE module instances via globalThis — the real bug this guards against', async () => {
    // Regression test for a real bug found on Expo Web: this package loads
    // as two genuinely separate module instances in the same app bundle
    // (Metro resolves a bare `import` through the "import" condition,
    // dist/index.web.mjs, but the babel plugin's injected
    // `require('@kbach/react-native').applyKbachConfig(...)` always
    // through "require", dist/index.web.js — ESM and CJS builds are never
    // the same module graph). `kbach.config.js`'s custom colors applied
    // through the require-side instance never reached `useColors()`,
    // which read the import-side instance's own untouched `defaultTheme`.
    //
    // `vi.resetModules()` + a fresh dynamic `import()` is vitest's own way
    // to simulate exactly that: two independently-instantiated copies of
    // this SAME source file, each with its own module-scope bindings had
    // this file still used a plain `let` — which is precisely what this
    // test would have caught, since it would have failed against the
    // pre-fix version (setTheme on moduleA would never have been visible
    // from moduleB).
    vi.resetModules();
    const moduleA = await import('./theme');
    vi.resetModules();
    const moduleB = await import('./theme');

    const customTheme = { ...moduleA.defaultTheme, colors: { ...moduleA.defaultTheme.colors, brandPrimary: '#ff6b35' } };
    moduleA.setTheme(customTheme);

    expect(moduleB.getTheme().colors.brandPrimary).toBe('#ff6b35');

    // Clean up the shared global slot so later tests in this file (and
    // this module's own top-level import) don't inherit a custom theme
    // left behind by this test.
    moduleB.setTheme(moduleB.defaultTheme);
  });
});
