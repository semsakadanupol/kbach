// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { resolve, clearCache } from './resolver';
import { buildConfig } from './config';
import type { ResolvedConfig } from './types';

// Regression coverage for a fixed architectural gap: CSS rules used to be
// inserted into the live <style> sheet in ENCOUNTER order (whichever class
// resolve() saw first). Two rules that differ only by modifier — e.g.
// `.hover\:bg-blue-6:hover` and `.focus\:bg-red-6:focus` — have equal CSS
// specificity, so when both conditions are true at once, the winner is
// whichever rule is LATER in the stylesheet. Without a fixed priority, that
// was effectively random: it depended on which component happened to render
// (and therefore resolve()) first. registry.ts's ModifierDef.order now gives
// every modifier a fixed cascade priority, and resolver.ts's injectRule()
// inserts each new rule at the position that priority dictates — these tests
// verify the actual live <style> sheet ends up in that fixed order
// regardless of which class was resolved first.

function getStyleSheet(): CSSStyleSheet {
  const el = document.querySelector('style[data-kbach]') as HTMLStyleElement | null;
  if (!el?.sheet) throw new Error('expected <style data-kbach> to exist with a sheet');
  return el.sheet;
}

function ruleTexts(): string[] {
  return Array.from(getStyleSheet().cssRules).map((r) => r.cssText);
}

function indexOfRuleContaining(needle: string): number {
  return ruleTexts().findIndex((t) => t.includes(needle));
}

describe('CSS rule cascade order is independent of resolve() call order', () => {
  let config: ResolvedConfig;

  beforeEach(() => {
    clearCache();
    config = buildConfig({});
  });

  it('places hover: before focus: even when focus: is resolved first', () => {
    resolve('focus:bg-red-6', config.theme, config.darkMode);
    resolve('hover:bg-blue-6', config.theme, config.darkMode);

    const hoverIdx = indexOfRuleContaining(':hover');
    const focusIdx = indexOfRuleContaining(':focus');
    expect(hoverIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThanOrEqual(0);
    expect(hoverIdx).toBeLessThan(focusIdx);
  });

  it('places hover: before focus: when hover: is resolved first too (order-independent both ways)', () => {
    resolve('hover:bg-blue-6', config.theme, config.darkMode);
    resolve('focus:bg-red-6', config.theme, config.darkMode);

    const hoverIdx = indexOfRuleContaining(':hover');
    const focusIdx = indexOfRuleContaining(':focus');
    expect(hoverIdx).toBeLessThan(focusIdx);
  });

  it('places disabled: after hover: regardless of resolve order', () => {
    resolve('disabled:opacity-50', config.theme, config.darkMode);
    resolve('hover:bg-blue-6', config.theme, config.darkMode);

    const hoverIdx = indexOfRuleContaining(':hover');
    const disabledIdx = indexOfRuleContaining(':disabled');
    expect(hoverIdx).toBeLessThan(disabledIdx);
  });

  it('a compound modifier chain takes the MAX order among its parts (hover:disabled sorts with disabled, not hover)', () => {
    resolve('hover:bg-blue-6', config.theme, config.darkMode);
    resolve('disabled:hover:bg-green-6', config.theme, config.darkMode);

    // 'disabled:hover' must land at disabled's priority (40), after plain hover's (10),
    // even though it also contains 'hover'.
    const plainHoverIdx = indexOfRuleContaining('.hover\\:bg-blue-6');
    const compoundIdx = indexOfRuleContaining('.disabled\\:hover\\:bg-green-6');
    expect(plainHoverIdx).toBeLessThan(compoundIdx);
  });

  it('keeps encounter order stable among rules with the SAME modifier order', () => {
    resolve('hover:bg-blue-6', config.theme, config.darkMode);
    resolve('hover:text-white', config.theme, config.darkMode);

    const bgIdx = indexOfRuleContaining('.hover\\:bg-blue-6');
    const textIdx = indexOfRuleContaining('.hover\\:text-white');
    expect(bgIdx).toBeLessThan(textIdx);
  });

  it('base (unmodified) rules always sort first', () => {
    resolve('hover:bg-blue-6', config.theme, config.darkMode);
    resolve('p-4', config.theme, config.darkMode);

    const baseIdx = indexOfRuleContaining('.p-4');
    const hoverIdx = indexOfRuleContaining(':hover');
    expect(baseIdx).toBeLessThan(hoverIdx);
  });
});

// Regression coverage for a second cascade-order gap in the same family:
// `justify-center`, `items-center`, `flex-row`, etc. fold `display: 'flex'`
// into their real property so they work standalone without also needing a
// `flex` class (see layout.ts). That gives them equal specificity with
// `hidden`/`flex`/`block` (utilities whose ENTIRE style IS `display`) — so
// without a fixed sub-order, `hidden` could silently lose a `display` fight
// to `justify-center` whenever the app happened to resolve `justify-center`
// after `hidden`. This bit `className="hidden md:flex"` in a real app: on
// some page loads `hidden` rendered nothing because a same-bucket
// `justify-center` rule landed later in the stylesheet and won the tie.
describe('pure-display utilities always win a same-bucket cascade tie', () => {
  let config: ResolvedConfig;

  beforeEach(() => {
    clearCache();
    config = buildConfig({});
  });

  it('sorts hidden after justify-center when hidden resolves first', () => {
    resolve('hidden', config.theme, config.darkMode);
    resolve('justify-center', config.theme, config.darkMode);

    const hiddenIdx = indexOfRuleContaining('.hidden');
    const justifyIdx = indexOfRuleContaining('.justify-center');
    expect(hiddenIdx).toBeGreaterThanOrEqual(0);
    expect(justifyIdx).toBeGreaterThanOrEqual(0);
    expect(justifyIdx).toBeLessThan(hiddenIdx);
  });

  it('sorts hidden after justify-center when justify-center resolves first too (order-independent both ways)', () => {
    resolve('justify-center', config.theme, config.darkMode);
    resolve('hidden', config.theme, config.darkMode);

    const hiddenIdx = indexOfRuleContaining('.hidden');
    const justifyIdx = indexOfRuleContaining('.justify-center');
    expect(justifyIdx).toBeLessThan(hiddenIdx);
  });

  it('sorts flex after items-center regardless of resolve order', () => {
    resolve('flex', config.theme, config.darkMode);
    resolve('items-center', config.theme, config.darkMode);

    const flexIdx = indexOfRuleContaining('.flex ');
    const itemsIdx = indexOfRuleContaining('.items-center');
    expect(itemsIdx).toBeLessThan(flexIdx);
  });

  it('still sorts md:flex after md:hidden — responsive pure-display utilities keep the same guarantee', () => {
    resolve('md:justify-center', config.theme, config.darkMode);
    resolve('md:hidden', config.theme, config.darkMode);

    const hiddenIdx = indexOfRuleContaining('.md\\:hidden');
    const justifyIdx = indexOfRuleContaining('.md\\:justify-center');
    expect(justifyIdx).toBeLessThan(hiddenIdx);
  });
});
