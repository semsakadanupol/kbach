import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInit = vi.fn(() => Promise.resolve());
const mockGenerateCss = vi.fn((classString: string, _themeJson: string) => `/* css for ${classString} */`);

vi.mock('@kbach/core-engine', () => ({
  default: mockInit,
  generate_css: mockGenerateCss,
}));

describe('wasmLoader', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('throws a clear, actionable error if generateCss is called before initKbach() resolves', async () => {
    const { generateCss } = await import('./wasmLoader');
    expect(() => generateCss('bg-blue-6', '{}')).toThrowError(/initKbach/);
  });

  it('is ready after initKbach() resolves, and generateCss delegates to the wasm module', async () => {
    const { initKbach, isKbachReady, generateCss } = await import('./wasmLoader');
    expect(isKbachReady()).toBe(false);

    await initKbach();

    expect(isKbachReady()).toBe(true);
    expect(generateCss('bg-blue-6', '{}')).toBe('/* css for bg-blue-6 */');
    expect(mockGenerateCss).toHaveBeenCalledWith('bg-blue-6', '{}');
  });

  it('memoizes initKbach() — repeat calls do not re-invoke the wasm init function', async () => {
    const { initKbach } = await import('./wasmLoader');
    await initKbach();
    await initKbach();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});
