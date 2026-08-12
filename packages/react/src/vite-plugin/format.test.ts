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
