import { describe, it, expect, vi } from 'vitest';
import { formatKbachCSS, writeKbachToFile } from './format';
import type { ThemeConfig } from '../theme';

function theme(): ThemeConfig {
  return {
    colors: { 'blue-6': '#2563eb' },
    spacing: { '4': 16 },
    screens: {},
    darkMode: 'attribute',
  };
}

describe('formatKbachCSS', () => {
  it('pretty-prints every rule from every token into one CSS body', () => {
    const map = new Map([
      ['flex', [{ rule: '.flex { display: flex }', order: 0 }]],
      ['p-4', [{ rule: '.p-4 { padding: 16px }', order: 0 }]],
    ]);
    const css = formatKbachCSS(map, theme());
    expect(css).toContain('.flex {\n  display: flex;\n}');
    // The spacing value is var-extracted since it matches the theme's scale.
    expect(css).toContain('.p-4 {\n  padding: var(--spacing-4);\n}');
  });

  it('extracts a used theme color into a :root custom property', () => {
    const map = new Map([['bg-blue-6', [{ rule: '.bg-blue-6 { background-color: #2563eb }', order: 0 }]]]);
    const css = formatKbachCSS(map, theme());
    expect(css).toContain(':root {');
    expect(css).toContain('--color-blue-6: #2563eb;');
    expect(css).toContain('background-color: var(--color-blue-6);');
  });

  it('merges same-breakpoint responsive rules into a single @media block', () => {
    const map = new Map([
      ['sm:flex', [{ rule: '@media (min-width: 640px) { .sm\\:flex { display: flex } }', order: 40 }]],
      ['sm:hidden', [{ rule: '@media (min-width: 640px) { .sm\\:hidden { display: none } }', order: 40 }]],
    ]);
    const css = formatKbachCSS(map, theme());
    expect(css.match(/@media \(min-width: 640px\)/g)?.length).toBe(1);
  });

  it('omits the :root block entirely when no theme values are actually used', () => {
    const map = new Map([['flex', [{ rule: '.flex { display: flex }', order: 0 }]]]);
    const css = formatKbachCSS(map, theme());
    expect(css).not.toContain(':root {');
  });

  it('sorts rules by cascade order, not by token-discovery (Map insertion) order', () => {
    // Regression test — background.rs's from-*/via-*/to-* gradient stops all
    // write to a shared --kb-gradient-to custom property, so whichever rule
    // sorts LAST in the actual output wins. This test deliberately inserts
    // the tokens into the Map in "to" -> "via" -> "from" order (the reverse
    // of what a real page's source-scan order might discover them in) to
    // prove the output is sorted by `order`, not by discovery/insertion
    // sequence.
    const map = new Map([
      ['to-blue-6', [{ rule: '.to-blue-6 { --kb-gradient-to: #2563eb }', order: 0.2 }]],
      ['via-blue-6', [{ rule: '.via-blue-6 { --kb-gradient-to: transparent }', order: 0.1 }]],
      ['from-blue-6', [{ rule: '.from-blue-6 { --kb-gradient-from: #2563eb }', order: 0 }]],
    ]);
    const css = formatKbachCSS(map, theme());
    const fromIdx = css.indexOf('.from-blue-6');
    const viaIdx = css.indexOf('.via-blue-6');
    const toIdx = css.indexOf('.to-blue-6');
    expect(fromIdx).toBeLessThan(viaIdx);
    expect(viaIdx).toBeLessThan(toIdx);
  });

  it('starts with the base reset, before any generated rules', () => {
    const map = new Map([['flex', [{ rule: '.flex { display: flex }', order: 0 }]]]);
    const css = formatKbachCSS(map, theme());
    expect(css).toContain('box-sizing: border-box');
    expect(css.indexOf('box-sizing: border-box')).toBeLessThan(css.indexOf('.flex'));
  });

  it('includes the full, unpruned reset when usedTags is omitted', () => {
    const map = new Map([['flex', [{ rule: '.flex { display: flex }', order: 0 }]]]);
    const css = formatKbachCSS(map, theme());
    expect(css).toContain('button { appearance: none');
    expect(css).toContain('table { border-collapse');
  });

  it('prunes the reset to only the tags in usedTags when provided', () => {
    const map = new Map([['flex', [{ rule: '.flex { display: flex }', order: 0 }]]]);
    const css = formatKbachCSS(map, theme(), new Set(['a']));
    expect(css).toContain('a { color: inherit; text-decoration: none; }');
    expect(css).not.toContain('button { appearance: none');
    expect(css).not.toContain('table { border-collapse');
    // Universal rules survive regardless.
    expect(css).toContain('box-sizing: border-box');
  });
});

describe('writeKbachToFile', () => {
  it('inserts the block between markers when the file is empty/new', () => {
    const write = vi.fn();
    const changed = writeKbachToFile(
      '/fake/kbach.css',
      '.flex { display: flex }',
      () => {
        throw new Error('ENOENT');
      },
      write,
    );
    expect(changed).toBe(true);
    expect(write).toHaveBeenCalledWith(
      '/fake/kbach.css',
      '/* kbach:start */\n.flex { display: flex }\n/* kbach:end */',
    );
  });

  it('replaces only the content between existing markers, preserving surrounding content', () => {
    const existing = '/* my own styles */\n.custom {}\n\n/* kbach:start */\n.old {}\n/* kbach:end */\n\n/* more custom */';
    const write = vi.fn();
    writeKbachToFile('/fake/kbach.css', '.new {}', () => existing, write);

    const written = write.mock.calls[0]![1] as string;
    expect(written).toContain('.custom {}');
    expect(written).toContain('.new {}');
    expect(written).not.toContain('.old {}');
    expect(written).toContain('/* more custom */');
  });

  it('returns false and does not write when content is unchanged', () => {
    const existing = '/* kbach:start */\n.flex { display: flex }\n/* kbach:end */';
    const write = vi.fn();
    const changed = writeKbachToFile('/fake/kbach.css', '.flex { display: flex }', () => existing, write);
    expect(changed).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
