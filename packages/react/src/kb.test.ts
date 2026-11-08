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

const mockGenerateCss = vi.fn((classString: string, _themeJson?: string) =>
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

  it("returns the engine's className when the engine expands a class", async () => {
    const { kb } = await import('./kb');
    // The engine still expands a mode-aware color whose values aren't hex
    // into per-mode classes; kb() must return that expanded className, the
    // text the injected rules were generated against. (The mock engine here
    // always expands bg-surface; the real one doesn't for hex colors, see
    // the next test.)
    expect(kb('bg-surface')).toBe('bg-[#f9fafb] dark:bg-[#111827]');
  });

  it('hands the engine mode-aware hex colors as their CSS variable, and defines the variables', async () => {
    const { kb } = await import('./kb');
    // So kb('bg-surface') styles .bg-surface itself, the same rule the
    // static kbach.css has, instead of per-mode classes it doesn't have.
    kb('bg-blue-6');
    const engineTheme = JSON.parse(mockGenerateCss.mock.calls[0]![1] as string);
    expect(engineTheme.colors.surface).toBe('rgb(var(--kb-color-surface))');
    expect(engineTheme.colors['blue-6']).toMatch(/^#/); // plain colors untouched
    expect(document.getElementById('kbach-colors')?.textContent).toContain('--kb-color-surface');
  });

  it("leaves classes the static kbach.css already defines to it", async () => {
    // Regression: a class in BOTH sheets let the later runtime sheet win
    // every tie, so a runtime .grid beat the static lg:hidden on another
    // element and the header's mobile-only buttons showed on desktop.
    const staticCss = document.createElement('style');
    staticCss.textContent = ':root { --kb-dark-mode: class; } .grid { display: grid } @media (min-width: 1024px) { .lg\\:hidden { display: none } }';
    document.head.appendChild(staticCss);
    try {
      const { kb } = await import('./kb');
      expect(kb('grid flex items-center lg:hidden')).toBe('grid lg:hidden flex items-center');
      expect(mockGenerateCss).toHaveBeenCalledWith('flex items-center', expect.any(String));
      const runtime = document.head.querySelector('[data-kbach]') as HTMLStyleElement;
      const injected = Array.from(runtime.sheet!.cssRules).map((r) => r.cssText).join('\n');
      expect(injected).toContain('.flex');
      expect(injected).not.toContain('.grid');
    } finally {
      staticCss.remove();
    }
    // without a static sheet, everything resolves at runtime again
    const { kb, _resetForTests } = await import('./kb');
    _resetForTests();
    mockGenerateCss.mockClear();
    kb('grid');
    expect(mockGenerateCss).toHaveBeenCalledWith('grid', expect.any(String));
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

  it('deduplicates repeat calls with the same class — no duplicate rules injected, and no redundant re-resolution', async () => {
    const { kb } = await import('./kb');
    kb('bg-blue-6');
    kb('bg-blue-6');
    kb('bg-blue-6');

    const styleEl = document.head.querySelector('[data-kbach]') as HTMLStyleElement;
    expect(styleEl.sheet?.cssRules.length).toBe(1);
    // Only the FIRST call actually crosses the WASM boundary — kb() caches
    // the resolved result per classString (invalidated on a theme change),
    // since re-resolving an already-seen class string on every call would be
    // pure waste for a component calling kb() on every render with the same
    // dynamic class.
    expect(mockGenerateCss).toHaveBeenCalledTimes(1);
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

  it('injects the base reset as a separate <style id="kbach-reset"> tag on first call', async () => {
    const { kb } = await import('./kb');
    kb('bg-blue-6');

    const resetEl = document.getElementById('kbach-reset');
    expect(resetEl).not.toBeNull();
    expect(resetEl?.textContent).toContain('box-sizing: border-box');
  });

  it('does not duplicate the reset tag across repeated calls', async () => {
    const { kb } = await import('./kb');
    kb('bg-blue-6');
    kb('flex items-center');

    expect(document.querySelectorAll('#kbach-reset').length).toBe(1);
  });

  it('skips injecting the reset if a tag with that id already exists (e.g. from <KbachReset/> SSR)', async () => {
    const preexisting = document.createElement('style');
    preexisting.id = 'kbach-reset';
    preexisting.textContent = '/* server-rendered */';
    document.head.appendChild(preexisting);

    const { kb } = await import('./kb');
    kb('bg-blue-6');

    expect(document.querySelectorAll('#kbach-reset').length).toBe(1);
    expect(document.getElementById('kbach-reset')?.textContent).toBe('/* server-rendered */');
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
    // Same for the reset — the static kbach.css already inlines BASE_RESET.
    expect(document.getElementById('kbach-reset')).toBeNull();
  });
});
