import { describe, it, expect, afterEach } from 'vitest';
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
});
