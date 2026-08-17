import { describe, it, expect } from 'vitest';
import { BASE_RESET, RESET_STYLE_ID, buildResetCSS } from './reset';

describe('reset', () => {
  it('exposes a stable style id shared between the runtime injector and <KbachReset/>', () => {
    expect(RESET_STYLE_ID).toBe('kbach-reset');
  });

  it('makes elements borderless and border-box by default', () => {
    expect(BASE_RESET).toContain('box-sizing: border-box');
    expect(BASE_RESET).toContain('border-width: 0');
  });

  it('strips native chrome from buttons and text-like inputs, but not checkbox/radio/select', () => {
    expect(BASE_RESET).toContain("input:where(:not([type='checkbox']):not([type='radio'])), textarea");
    expect(BASE_RESET).toContain('button { appearance: none');
    expect(BASE_RESET).not.toContain("input[type='checkbox'] { appearance: none");
    expect(BASE_RESET).toContain("input[type='checkbox'], input[type='radio'], input[type='range']");
    expect(BASE_RESET).toContain('select { margin: 0; font: inherit');
  });

  it('normalizes placeholder opacity across browsers', () => {
    expect(BASE_RESET).toContain('::placeholder { opacity: 1; }');
  });

  it('wraps the checkbox/radio/range accent-color reset in :where() so an accent-* utility can override it', () => {
    // Regression: a bare `input[type='range']` attribute selector has
    // specificity (0,1,1), MORE than any single utility class (0,1,0) — so
    // an `accent-*` utility applied directly to a checkbox/radio/range
    // resolved and injected correctly but silently never painted, losing
    // the cascade to this reset regardless of source order. Same bug class
    // (and same :where() fix) as the input:not(...) exclusions above.
    expect(BASE_RESET).toContain(":where(input[type='checkbox'], input[type='radio'], input[type='range'])");
  });
});

describe('buildResetCSS', () => {
  it('returns the full, unpruned reset when usedTags is undefined', () => {
    expect(buildResetCSS(undefined)).toBe(BASE_RESET);
  });

  it('always includes the universal box-sizing and body rules, even with no tags used', () => {
    const css = buildResetCSS(new Set());
    expect(css).toContain('box-sizing: border-box');
    expect(css).toContain('body { margin: 0; padding: 0; }');
  });

  it('omits every tag-gated rule when that tag is never used', () => {
    const css = buildResetCSS(new Set());
    expect(css).not.toContain('a { color: inherit');
    expect(css).not.toContain('button { appearance: none');
    expect(css).not.toContain('select { margin: 0');
    expect(css).not.toContain('table { border-collapse');
  });

  it('includes only the anchor reset when only <a> is used', () => {
    const css = buildResetCSS(new Set(['a']));
    expect(css).toContain('a { color: inherit; text-decoration: none; }');
    expect(css).not.toContain('button { appearance: none');
    expect(css).not.toContain("select { margin: 0");
  });

  it('includes the input/textarea rules (including :disabled and ::placeholder) when <input> is used', () => {
    const css = buildResetCSS(new Set(['input']));
    expect(css).toContain("input:where(:not([type='checkbox']):not([type='radio'])), textarea { appearance: none");
    expect(css).toContain(':disabled { cursor: default; }');
    expect(css).toContain('::placeholder { opacity: 1; }');
    expect(css).not.toContain('table { border-collapse');
  });

  it('includes h1-h6 rule when any single heading level is used', () => {
    const css = buildResetCSS(new Set(['h3']));
    expect(css).toContain('h1, h2, h3, h4, h5, h6 { margin: 0');
  });
});
