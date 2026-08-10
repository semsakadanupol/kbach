// No jsdom pragma — plain Node, matching ThemeProvider.ssr.test.ts. isNative
// requires isWeb to be false (see core/platform.ts), and the disableRuntimeCSS
// tests below use renderToStaticMarkup (real SSR) rather than jsdom precisely
// because SSR is the scenario this component exists for (see its own comment).

// Regression coverage for a fixed bug: KbachReset rendered its <style
// id="kbach-reset"> tag UNCONDITIONALLY, with no check against
// disableRuntimeCSS() — so an app using the static-CSS Vite-plugin setup
// (kbach.css already inlines this exact reset) that ALSO kept <KbachReset/>
// mounted (e.g. a starter template's root layout, never revisited) got the
// same reset rules twice on every single page load. "Static" CSS wasn't
// actually leak-free in that real, common setup. Fixed by checking
// isRuntimeCSSDisabled() and rendering nothing once it's true.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { KbachReset } from './KbachReset';
import { disableRuntimeCSS, isRuntimeCSSDisabled, RESET_STYLE_ID } from './core';

describe('KbachReset', () => {
  // Runs BEFORE the disableRuntimeCSS() tests below — that flag is
  // process-wide (getGlobalSingleton-backed, no re-enable path by design,
  // same as production) so within this one file it can only ever go
  // false → true, never back. Order matters.
  it('renders the reset <style id="kbach-reset"> tag when runtime CSS is not disabled', () => {
    expect(isRuntimeCSSDisabled()).toBe(false);
    const html = renderToStaticMarkup(React.createElement(KbachReset));
    expect(html).toContain(`id="${RESET_STYLE_ID}"`);
    expect(html).toContain('box-sizing: border-box');
  });

  it('renders nothing once disableRuntimeCSS() has fired — the static file already has this reset', () => {
    disableRuntimeCSS();
    expect(isRuntimeCSSDisabled()).toBe(true);
    const html = renderToStaticMarkup(React.createElement(KbachReset));
    expect(html).toBe('');
  });
});
