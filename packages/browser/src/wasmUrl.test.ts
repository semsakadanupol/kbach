import { describe, it, expect } from 'vitest';
import { resolveWasmUrl } from './wasmUrl';

const PAGE = 'http://127.0.0.1:5500/apps/web-cdn/index.html';
const V = '1.2.3-beta.4';
const at = (src: string | undefined, dataWasm?: string) => resolveWasmUrl(src, dataWasm, PAGE, V);

describe('resolveWasmUrl', () => {
  it("resolves jsDelivr's short package URL to this exact version's dist/ (regression: 1.0.0-beta.0 requested /npm/@kbach/kbach_core_engine_bg.wasm, a 404)", () => {
    expect(at('https://cdn.jsdelivr.net/npm/@kbach/browser')).toBe(
      `https://cdn.jsdelivr.net/npm/@kbach/browser@${V}/dist/kbach_core_engine_bg.wasm`,
    );
    expect(at('https://cdn.jsdelivr.net/npm/@kbach/browser/')).toBe(
      `https://cdn.jsdelivr.net/npm/@kbach/browser@${V}/dist/kbach_core_engine_bg.wasm`,
    );
  });

  it('pins to the running version even when the URL names a tag or another version', () => {
    expect(at('https://cdn.jsdelivr.net/npm/@kbach/browser@beta')).toBe(
      `https://cdn.jsdelivr.net/npm/@kbach/browser@${V}/dist/kbach_core_engine_bg.wasm`,
    );
    expect(at('https://cdn.jsdelivr.net/npm/@kbach/browser@1?x=1#y')).toBe(
      `https://cdn.jsdelivr.net/npm/@kbach/browser@${V}/dist/kbach_core_engine_bg.wasm`,
    );
  });

  it("handles unpkg's short URL the same way", () => {
    expect(at('https://unpkg.com/@kbach/browser')).toBe(`https://unpkg.com/@kbach/browser@${V}/dist/kbach_core_engine_bg.wasm`);
  });

  it('uses the file next to the script for a full file URL or a self-hosted script', () => {
    expect(at('https://cdn.jsdelivr.net/npm/@kbach/browser@1.0.0/dist/kbach.js')).toBe(
      'https://cdn.jsdelivr.net/npm/@kbach/browser@1.0.0/dist/kbach_core_engine_bg.wasm',
    );
    expect(at('/vendor/kbach.js')).toBe('http://127.0.0.1:5500/vendor/kbach_core_engine_bg.wasm');
  });

  it('honors data-wasm, resolved against the page', () => {
    expect(at('https://cdn.jsdelivr.net/npm/@kbach/browser', '/assets/engine.wasm')).toBe('http://127.0.0.1:5500/assets/engine.wasm');
  });

  it('falls back to next to the page with no script src', () => {
    expect(at(undefined)).toBe('http://127.0.0.1:5500/apps/web-cdn/kbach_core_engine_bg.wasm');
  });
});
