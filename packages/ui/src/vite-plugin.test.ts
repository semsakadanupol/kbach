import { describe, it, expect } from 'vitest';
import { formatKbachCSS } from './vite-plugin';
import { buildConfig } from './core/config';
import { generateClassCSS } from './core/resolver';

// Regression coverage for a fixed bug: the static-CSS generator (this file)
// grouped tokens by utility family (Layout/Colors/Effects/…) for readability,
// but within a group it kept whatever order the file scanner happened to
// discover tokens in. Two same-specificity rules in the same group — e.g.
// `hover:bg-blue-6` and `focus:bg-red-6`, both "Colors" — would land in
// scan-discovery order, making which one wins when both pseudo-states are
// active at once depend on source-scan order instead of a fixed priority.
// formatKbachCSS() now sorts each group by registry.ts's ModifierDef.order
// (the same source of truth the runtime injector uses) before joining.

const config = buildConfig({});
const responsiveRe = /^(sm|md|lg|xl|2xl):/;

function buildTokenCSS(tokens: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of tokens) map.set(t, generateClassCSS(t, config.theme, config.darkMode, {}));
  return map;
}

describe('formatKbachCSS — same-group rule order is independent of scan order', () => {
  it('places hover: before focus: when focus: is scanned first', () => {
    const css = formatKbachCSS(buildTokenCSS(['focus:bg-red-6', 'hover:bg-blue-6']), config.theme, responsiveRe);
    const hoverIdx = css.indexOf(':hover');
    const focusIdx = css.indexOf(':focus');
    expect(hoverIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThanOrEqual(0);
    expect(hoverIdx).toBeLessThan(focusIdx);
  });

  it('places hover: before focus: when hover: is scanned first too (order-independent both ways)', () => {
    const css = formatKbachCSS(buildTokenCSS(['hover:bg-blue-6', 'focus:bg-red-6']), config.theme, responsiveRe);
    expect(css.indexOf(':hover')).toBeLessThan(css.indexOf(':focus'));
  });

  it('places disabled: after hover: regardless of scan order', () => {
    const css = formatKbachCSS(buildTokenCSS(['disabled:bg-gray-4', 'hover:bg-blue-6']), config.theme, responsiveRe);
    // Search for the specific class selectors, not bare ':hover'/':disabled' —
    // the base CSS reset also contains an unrelated ':disabled { cursor: default }' rule.
    expect(css.indexOf('.hover\\:bg-blue-6')).toBeLessThan(css.indexOf('.disabled\\:bg-gray-4'));
  });

  it('keeps scan order stable among tokens with the same modifier order', () => {
    const css = formatKbachCSS(buildTokenCSS(['hover:bg-blue-6', 'hover:text-white']), config.theme, responsiveRe);
    expect(css.indexOf('.hover\\:bg-blue-6')).toBeLessThan(css.indexOf('.hover\\:text-white'));
  });
});

// Returns the text between a `/* Label */` section header and the next one
// (or end of string), so a test can assert a specific rule landed in the
// section it belongs to.
function sectionBody(css: string, label: string): string {
  const start = css.indexOf(`/* ${label} */`);
  if (start === -1) return '';
  const next = css.indexOf('\n/* ', start + 1);
  return css.slice(start, next === -1 ? undefined : next);
}

describe('classifyToken (via formatKbachCSS) — every modifier gets stripped, not just hover/focus/active/group-hover/peer-hover', () => {
  // Regression: the old strip regex only covered those 5 modifiers, so any
  // other one (disabled, checked, focus-within, focus-visible, visited,
  // first, before, group-focus, rtl, …) fell through to the 'Utilities'
  // catch-all instead of its real category — undermining the cascade-order
  // fix above for exactly those modifiers, since cross-group order isn't
  // guaranteed to match ModifierDef.order the way within-group order is.
  it.each([
    ['disabled:bg-gray-4', 'Colors'],
    ['checked:bg-blue-6', 'Colors'],
    ['focus-within:ring-2', 'Borders'],
    ['focus-visible:outline-none', 'Borders'],
    ['visited:text-purple-6', 'Colors'],
    ['group-focus:opacity-100', 'Effects'],
    ['rtl:text-right', 'Typography'],
  ])('%s lands in "%s", not "Utilities"', (token, expectedLabel) => {
    const css = formatKbachCSS(buildTokenCSS([token]), config.theme, responsiveRe);
    const escapedSelector = `.${token.replace(/[:.]/g, '\\$&')}`;
    expect(sectionBody(css, expectedLabel)).toContain(escapedSelector);
    expect(sectionBody(css, 'Utilities')).not.toContain(escapedSelector);
  });
});
