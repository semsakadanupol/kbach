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

// Same as buildTokenCSS, but with real numeric screens — needed to exercise
// the responsive @media-wrapping path below (buildClassCSSRules only wraps a
// rule in `@media (min-width: …)` when the screens map actually resolves the
// modifier to a nonzero width; buildTokenCSS's empty `{}` screens above never
// triggers it, which is why those tests don't need it).
const numericScreens: Record<string, number> = {};
for (const [k, v] of Object.entries(config.theme.screens ?? {})) {
  numericScreens[k] = typeof v === 'number' ? v : parseInt(String(v), 10);
}

function buildResponsiveTokenCSS(tokens: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of tokens) map.set(t, generateClassCSS(t, config.theme, config.darkMode, numericScreens));
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

// Regression: escapeCSSSelector() escaped punctuation (":", ".", "[", …) but
// not a leading digit — `.2xl\:text-lg { … }` is invalid CSS (identifiers
// can't start with an unescaped digit) and every browser silently fails to
// match it, so the default "2xl" breakpoint (and any other numeric-leading
// class) never actually applied via the static stylesheet. Fixed to escape
// a leading digit per the CSS spec: backslash + hex code point + a
// terminating space.
describe('formatKbachCSS — numeric-leading class names (the "2xl" breakpoint) escape to valid CSS', () => {
  it('escapes the leading digit in "2xl:text-lg" as \\32 (hex for "2"), not a bare unescaped 2', () => {
    const css = formatKbachCSS(buildResponsiveTokenCSS(['2xl:text-lg']), config.theme, responsiveRe);
    expect(css).toContain('.\\32 xl\\:text-lg');
    // The old, broken form — an unescaped digit right after the selector dot.
    expect(css).not.toContain('.2xl\\:text-lg');
  });

  it('leaves classes with no leading digit unaffected', () => {
    const css = formatKbachCSS(buildResponsiveTokenCSS(['sm:text-lg']), config.theme, responsiveRe);
    expect(css).toContain('.sm\\:text-lg');
  });
});

// Regression: every responsive class got its OWN `@media (min-width: …) { … }`
// wrapper in the generated static CSS — correct for the runtime <style>-sheet
// injection path (each rule inserted independently), but for the static file
// it meant a project with many classes at the same breakpoint (`sm:p-4`,
// `sm:text-lg`, `sm:flex`, …) repeated the identical `@media (min-width:
// 640px)` wrapper once per class instead of once per breakpoint. Fixed by
// merging same-condition responsive rules into one @media block.
describe('formatKbachCSS — responsive classes at the same breakpoint share one @media block', () => {
  it('merges multiple sm: classes into a single @media (min-width: …) wrapper', () => {
    const css = formatKbachCSS(
      buildResponsiveTokenCSS(['sm:text-lg', 'sm:flex', 'sm:p-4']),
      config.theme,
      responsiveRe,
    );
    const wrapper = `@media (min-width: ${numericScreens.sm}px)`;
    const occurrences = css.split(wrapper).length - 1;
    expect(occurrences).toBe(1);
    expect(css).toContain('.sm\\:text-lg');
    expect(css).toContain('.sm\\:flex');
    expect(css).toContain('.sm\\:p-4');
  });

  it('keeps different breakpoints in their own separate @media blocks', () => {
    const css = formatKbachCSS(
      buildResponsiveTokenCSS(['sm:text-lg', 'md:text-lg', 'lg:text-lg']),
      config.theme,
      responsiveRe,
    );
    expect(css.split(`@media (min-width: ${numericScreens.sm}px)`).length - 1).toBe(1);
    expect(css.split(`@media (min-width: ${numericScreens.md}px)`).length - 1).toBe(1);
    expect(css.split(`@media (min-width: ${numericScreens.lg}px)`).length - 1).toBe(1);
  });

  it('orders merged @media blocks ascending by min-width regardless of scan order', () => {
    const css = formatKbachCSS(
      buildResponsiveTokenCSS(['lg:text-lg', 'sm:text-lg', 'md:text-lg']),
      config.theme,
      responsiveRe,
    );
    const smIdx = css.indexOf(`@media (min-width: ${numericScreens.sm}px)`);
    const mdIdx = css.indexOf(`@media (min-width: ${numericScreens.md}px)`);
    const lgIdx = css.indexOf(`@media (min-width: ${numericScreens.lg}px)`);
    expect(smIdx).toBeLessThan(mdIdx);
    expect(mdIdx).toBeLessThan(lgIdx);
  });
});

// Regression: buildColorVarMap's hex/rgba-triplet → var() substitution used
// a plain .split(pattern).join(replacement), which matches `pattern`
// ANYWHERE in a rule's text — including inside the SELECTOR, not just the
// declaration it's meant for. An arbitrary-value class using the same raw
// value as a real theme color (e.g. `bg-[#6366f1]`, indigo-6's exact hex)
// escapes to `.bg-\[\#6366f1\]`, which contains the literal substring
// "#6366f1" right after its escaping backslash — the blind replace turned
// that into `.bg-\[\var(--color-indigo-6)\]`, corrupting the selector's
// escape structure so badly that lightningcss's CSS minifier refused to
// parse it at all ("Expected identifier in class selector"). Confirmed live
// against a real project build. Fixed with a negative lookbehind for `\` —
// declaration values are never backslash-prefixed in this codebase, only
// escapeCSSSelector's output is, so that reliably tells the two apart.
describe('formatKbachCSS — color-variable substitution does not corrupt arbitrary-value selectors', () => {
  it('leaves a hex-arbitrary-value selector untouched even when it matches a real theme color', () => {
    const css = formatKbachCSS(buildTokenCSS(['bg-[#6366f1]']), config.theme, responsiveRe);
    // Correctly escaped selector, hex value intact.
    expect(css).toContain('.bg-\\[\\#6366f1\\]');
    // The old, corrupted form — an orphaned backslash migrated in front of
    // "var(...)" instead of staying in front of the hex value.
    expect(css).not.toContain('\\var(');
    // The declaration itself should still get var()-substituted — this
    // isn't "never touch matching text," only the selector must be spared.
    expect(css).toContain('var(--color-indigo-6-rgb)');
  });
});
