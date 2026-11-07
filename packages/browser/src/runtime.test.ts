import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';

// The real Rust engine (Node-target WASM build), in place of the browser
// loader. Everything else (kb() injection, theme, color variables, dark
// mode) is the real module.
vi.mock('../../react/src/wasmLoader', async () => {
  // Resolved from @kbach/react's wasmLoader.ts, the same copy the real bundle uses (see scripts/copy-wasm.mjs).
  // A plain path, not `new URL(...)`: under jsdom the global URL is jsdom's, which createRequire rejects.
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const reactLoader = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'react', 'src', 'wasmLoader.ts');
  const { generate_css } = createRequire(reactLoader)('@kbach/core-engine/node') as {
    generate_css(classString: string, themeJson: string): string;
  };
  return {
    initKbach: () => Promise.resolve(),
    initKbachFrom: vi.fn(() => Promise.resolve()),
    isKbachReady: () => true,
    generateCss: generate_css,
  };
});

import { startKbachCdn } from './runtime';
import { initKbachFrom } from '../../react/src/wasmLoader';
import { _resetForTests as resetKb } from '../../react/src/kb';
import { _resetForTests as resetColorVariables } from '../../react/src/colorVariables';
import { setTheme, defaultTheme } from '../../react/src/theme';

const css = () =>
  Array.from(document.querySelectorAll('style'))
    .map((el) => Array.from(el.sheet?.cssRules ?? []).map((r) => r.cssText).join('\n') || el.textContent)
    .join('\n');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetKb();
  resetColorVariables();
  setTheme(defaultTheme);
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
});

describe('startKbachCdn', () => {
  it('styles classes already on the page once the engine is ready, and loads the wasm from the given URL', async () => {
    document.body.innerHTML = '<div class="p-4 bg-blue-6 page-own-class"><svg class="w-4"></svg></div>';
    const api = startKbachCdn({ document, wasmUrl: 'https://cdn.example/kbach_core_engine_bg.wasm' });
    await api.ready;
    expect(initKbachFrom).toHaveBeenCalledWith('https://cdn.example/kbach_core_engine_bg.wasm');
    expect(css()).toMatch(/\.p-4\s*\{[^}]*padding:\s*16px/);
    expect(css()).toContain('.bg-blue-6');
    // SVG elements: className is an SVGAnimatedString, read via getAttribute
    expect(css()).toMatch(/\.w-4\s*\{/);
  });

  it('styles elements added later and class attributes changed later', async () => {
    const api = startKbachCdn({ document, wasmUrl: 'x.wasm' });
    await api.ready;

    const el = document.createElement('section');
    el.innerHTML = '<p class="mt-2">nested</p>';
    el.className = 'flex';
    document.body.appendChild(el);
    await settle();
    expect(css()).toMatch(/\.flex\s*\{[^}]*display:\s*flex/);
    expect(css()).toMatch(/\.mt-2\s*\{/);

    el.setAttribute('class', 'gap-3');
    await settle();
    expect(css()).toMatch(/\.gap-3\s*\{/);
  });

  it('applies the config: custom colors resolve, mode-aware colors use a CSS variable, and the page class is never rewritten', async () => {
    document.body.innerHTML = '<div id="t" class="bg-brand bg-panel"></div>';
    const api = startKbachCdn({
      document,
      wasmUrl: 'x.wasm',
      config: { darkMode: 'class', extend: { colors: { brand: '#ff6b35', panel: { light: '#ffffff', dark: '#000000' } } } },
    });
    await api.ready;
    expect(css()).toContain('.bg-brand');
    expect(css()).toMatch(/\.bg-panel\s*\{[^}]*var\(--kb-color-panel\)/);
    expect(css()).toMatch(/\.dark\s*\{[^}]*--kb-color-panel:\s*0,\s*0,\s*0/);
    expect(document.getElementById('t')!.getAttribute('class')).toBe('bg-brand bg-panel');
  });

  it('config() re-styles the page against the new theme', async () => {
    document.body.innerHTML = '<div class="bg-brand"></div>';
    const api = startKbachCdn({ document, wasmUrl: 'x.wasm' });
    await api.ready;
    expect(css()).not.toContain('.bg-brand');

    api.config({ extend: { colors: { brand: '#ff6b35' } } });
    expect(css()).toContain('.bg-brand');
  });

  it('setMode/toggle drive the configured dark-mode strategy on <html>', async () => {
    const api = startKbachCdn({ document, wasmUrl: 'x.wasm', config: { darkMode: 'attribute' } });
    await api.ready;
    api.setMode('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    api.toggle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('does not touch the engine for classes it has already resolved', async () => {
    document.body.innerHTML = '<div class="p-4"></div>';
    const api = startKbachCdn({ document, wasmUrl: 'x.wasm' });
    await api.ready;
    const before = css();
    const again = document.createElement('div');
    again.className = 'p-4';
    document.body.appendChild(again);
    await settle();
    expect(css()).toBe(before);
  });
});
