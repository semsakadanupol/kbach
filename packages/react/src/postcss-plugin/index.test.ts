import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import postcss from 'postcss';
import kbachPostcss from './index';

describe('kbachPostcss() plugin', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('replaces the kbach:start/kbach:end marker region with generated CSS, preserving surrounding content', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-postcss-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex bg-blue-6" />', 'utf-8');

    const cssFile = join(dir, 'globals.css');
    const input = ['.before-marker { color: red; }', '/* kbach:start */', '/* kbach:end */', '.after-marker { color: blue; }'].join(
      '\n',
    );

    const result = await postcss([kbachPostcss({ root: dir })]).process(input, { from: cssFile });

    expect(result.css).toContain('.before-marker { color: red; }');
    expect(result.css).toContain('.after-marker { color: blue; }');
    expect(result.css).toContain('display: flex');
    expect(result.css).toContain('background-color');
  });

  it('registers a dir-dependency message for every scanned include directory', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-postcss-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const input = '/* kbach:start */\n/* kbach:end */';
    const result = await postcss([kbachPostcss({ root: dir, include: ['src'] })]).process(input, {
      from: join(dir, 'globals.css'),
    });

    const dirDeps = result.messages.filter((m) => m.type === 'dir-dependency');
    expect(dirDeps).toHaveLength(1);
    expect((dirDeps[0] as unknown as { dir: string }).dir).toBe(join(dir, 'src'));
  });

  it('warns and leaves the file untouched when no marker pair is present', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-postcss-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const input = '.no-markers { color: green; }';
    const result = await postcss([kbachPostcss({ root: dir })]).process(input, { from: join(dir, 'globals.css') });

    expect(result.css.trim()).toBe(input);
  });

  it('resolves a safelisted class even when no scanned source file references it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-postcss-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const input = '/* kbach:start */\n/* kbach:end */';
    const result = await postcss([kbachPostcss({ root: dir, safelist: ['sr-only'] })]).process(input, {
      from: join(dir, 'globals.css'),
    });

    expect(result.css).toContain('.sr-only');
  });

  it('auto-discovers kbach.config.js at the project root, same as the Vite plugin', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-postcss-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');

    const input = '/* kbach:start */\n/* kbach:end */';
    const result = await postcss([kbachPostcss({ root: dir })]).process(input, { from: join(dir, 'globals.css') });

    expect(result.css).toContain('--color-brand-rgb: 255,107,53');
    expect(result.css).toContain('.bg-brand');
  });
});
