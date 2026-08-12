import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RuleEntry {
  rule: string;
  order: number;
}

const resultTable: Record<string, { className: string; rules: RuleEntry[] }> = {
  'bg-blue-6': {
    className: 'bg-blue-6',
    rules: [{ rule: '.bg-blue-6 { background-color: #2563eb }', order: 0 }],
  },
  'flex items-center': {
    className: 'flex items-center',
    rules: [
      { rule: '.flex { display: flex }', order: 0 },
      { rule: '.items-center { align-items: center }', order: 0 },
    ],
  },
  'dark:bg-blue-8': {
    className: 'dark:bg-blue-8',
    rules: [{ rule: '[data-theme="dark"] .dark\\:bg-blue-8 { background-color: #1e40af }', order: 30 }],
  },
  'hover:bg-blue-8': {
    className: 'hover:bg-blue-8',
    rules: [{ rule: '.hover\\:bg-blue-8:hover { background-color: #1e40af }', order: 10 }],
  },
  'bg-surface': {
    // Mode-aware colors expand to a DIFFERENT className than the input —
    // this is the exact shape the real Rust engine returns for them.
    className: 'bg-[#f9fafb] dark:bg-[#111827]',
    rules: [
      { rule: '.bg-\\[\\#f9fafb\\] { background-color: #f9fafb }', order: 0 },
      { rule: '[data-theme="dark"] .dark\\:bg-\\[\\#111827\\] { background-color: #111827 }', order: 30 },
    ],
  },
};

const mockGenerateCss = vi.fn((classString: string) =>
  JSON.stringify(resultTable[classString] ?? { className: classString, rules: [] }),
);

vi.mock('./wasmLoader', () => ({
  generateCss: mockGenerateCss,
}));

describe('kb()', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { _resetForTests } = await import('./kb');
    _resetForTests();
    document.head.querySelectorAll('[data-kbach]').forEach((el) => el.remove());
  });

  it('returns the resolved className for use as className', async () => {
    const { kb } = await import('./kb');
    expect(kb('bg-blue-6')).toBe('bg-blue-6');
  });

  it('returns the MODE-AWARE-EXPANDED className, not the original input, for mode-aware colors', async () => {
    const { kb } = await import('./kb');
    // Regression: kb() must return the expanded className the CSS rules
    // were actually generated against — returning the original "bg-surface"
    // would leave the element carrying a className that matches none of the
    // injected selectors.
    expect(kb('bg-surface')).toBe('bg-[#f9fafb] dark:bg-[#111827]');
  });

  it('injects the resolved CSS into a single <style data-kbach> tag', async () => {
    const { kb } = await import('./kb');
    kb('bg-blue-6');

    const styleEl = document.head.querySelector('[data-kbach]') as HTMLStyleElement;
    expect(styleEl).not.toBeNull();
    expect(styleEl.sheet?.cssRules.length).toBe(1);
    expect(styleEl.sheet?.cssRules[0]?.cssText).toContain('background-color');
  });

  it('injects multiple rules from a multi-class string', async () => {
    const { kb } = await import('./kb');
    kb('flex items-center');

    const styleEl = document.head.querySelector('[data-kbach]') as HTMLStyleElement;
    expect(styleEl.sheet?.cssRules.length).toBe(2);
  });

  it('deduplicates repeat calls with the same class — no duplicate rules injected', async () => {
    const { kb } = await import('./kb');
    kb('bg-blue-6');
    kb('bg-blue-6');
    kb('bg-blue-6');

    const styleEl = document.head.querySelector('[data-kbach]') as HTMLStyleElement;
    expect(styleEl.sheet?.cssRules.length).toBe(1);
    expect(mockGenerateCss).toHaveBeenCalledTimes(3); // still resolves every call...
    // ...but only injects once, since the rule text is identical.
  });

  it('reuses one <style> tag across calls with different classes', async () => {
    const { kb } = await import('./kb');
    kb('bg-blue-6');
    kb('flex items-center');

    expect(document.head.querySelectorAll('[data-kbach]').length).toBe(1);
  });

  it('cascade-order-safe: a later call with a LOWER order is inserted BEFORE an earlier, higher-order rule', async () => {
    const { kb } = await import('./kb');
    // dark: (order 30) resolved and injected first...
    kb('dark:bg-blue-8');
    // ...then hover: (order 10) resolved second, but must land BEFORE the
    // dark: rule in the live sheet — insertion order alone (a plain append,
    // Phase 1's behavior) would get this backwards.
    kb('hover:bg-blue-8');

    const styleEl = document.head.querySelector('[data-kbach]') as HTMLStyleElement;
    const cssTexts = Array.from(styleEl.sheet!.cssRules).map((r) => r.cssText);
    expect(cssTexts.length).toBe(2);
    expect(cssTexts[0]).toContain('hover');
    expect(cssTexts[1]).toContain('dark');
  });

  it('disableRuntimeCSS() skips rule injection but still returns the resolved className', async () => {
    const { kb, disableRuntimeCSS, isRuntimeCSSDisabled } = await import('./kb');
    expect(isRuntimeCSSDisabled()).toBe(false);

    disableRuntimeCSS();
    expect(isRuntimeCSSDisabled()).toBe(true);

    // Mode-aware expansion must still happen — a static kbach.css's
    // selectors are generated against the expanded className too.
    expect(kb('bg-surface')).toBe('bg-[#f9fafb] dark:bg-[#111827]');

    // No <style data-kbach> tag should have been created — the static file
    // is what's expected to serve these rules once disabled.
    expect(document.head.querySelector('[data-kbach]')).toBeNull();
  });
});
