// @vitest-environment jsdom
// cssInjector.web.ts's real DOM injection (a <style> tag, CSSOM
// insertRule) is exercised here (unlike every other test in this package,
// which never touches a DOM at all) — this package's default vitest
// environment is 'node' (see vitest.config.ts), so this file opts into
// jsdom on its own, same as @kbach/react's jsdom-environment tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInitSync = vi.fn();
const mockGenerateCssAttr = vi.fn(
  (_classString: string, _themeJson: string) =>
    '{"className":"flex","rules":[{"rule":"[data-kb~=\\"flex\\"] { display: flex }","order":0}]}',
);

vi.mock('./wasmGlue.generated', () => ({
  initSync: mockInitSync,
  generate_css_attr: mockGenerateCssAttr,
}));

// The real wasmBinary.generated.ts is a ~400KB base64 string committed for
// production use — irrelevant to these tests (initSync itself is mocked
// above), so a tiny stand-in keeps the test file/output readable.
vi.mock('./wasmBinary.generated', () => ({ KBACH_CORE_ENGINE_WASM_BASE64: 'AA==' }));

describe('nativeBridge.web', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    document.querySelectorAll('style[data-kbach-rn]').forEach((el) => el.remove());
  });

  it('initializes wasm eagerly at module load — resolveClassName works with no init call', async () => {
    const { resolveClassName } = await import('./nativeBridge.web');
    expect(mockInitSync).toHaveBeenCalledTimes(1);
    resolveClassName('flex');
    expect(mockGenerateCssAttr).toHaveBeenCalledWith('flex', expect.any(String));
  });

  it('returns the (possibly mode-aware-expanded) className the engine reports, not the raw input', async () => {
    mockGenerateCssAttr.mockReturnValue(
      '{"className":"bg-[#f9fafb] dark:bg-[#111827]","rules":[]}',
    );
    const { resolveClassName } = await import('./nativeBridge.web');
    expect(resolveClassName('bg-surface')).toBe('bg-[#f9fafb] dark:bg-[#111827]');
  });

  it('injects every returned rule into a shared <style data-kbach-rn> tag', async () => {
    mockGenerateCssAttr.mockReturnValue(
      '{"className":"flex hover:bg-blue-8","rules":[' +
        '{"rule":"[data-kb~=\\"flex\\"] { display: flex }","order":0},' +
        '{"rule":"[data-kb~=\\"hover:bg-blue-8\\"]:hover { background-color: #1e40af }","order":10}' +
        ']}',
    );
    const { resolveClassName } = await import('./nativeBridge.web');
    resolveClassName('flex hover:bg-blue-8');

    const styleEl = document.querySelector('style[data-kbach-rn]') as HTMLStyleElement | null;
    expect(styleEl).not.toBeNull();
    const cssText = Array.from(styleEl!.sheet!.cssRules)
      .map((r) => (r as CSSStyleRule).cssText)
      .join('\n');
    expect(cssText).toContain('display: flex');
    expect(cssText).toContain(':hover');
  });

  it('does not re-insert an already-injected rule on a later call', async () => {
    mockGenerateCssAttr.mockReturnValue(
      '{"className":"flex","rules":[{"rule":"[data-kb~=\\"flex\\"] { display: flex }","order":0}]}',
    );
    const { resolveClassName } = await import('./nativeBridge.web');
    resolveClassName('flex');
    resolveClassName('flex');

    const styleEl = document.querySelector('style[data-kbach-rn]') as HTMLStyleElement | null;
    expect(styleEl!.sheet!.cssRules.length).toBe(1);
  });
});
