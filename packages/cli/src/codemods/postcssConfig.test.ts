import { describe, it, expect } from 'vitest';
import { patchPostcssConfig, isPostcssConfigWired } from './postcssConfig';

describe('patchPostcssConfig', () => {
  it('adds a new plugins object to a bare module.exports = {}', () => {
    const result = patchPostcssConfig('module.exports = {};\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.code).toContain("'@kbach/react/postcss': {}");
  });

  it('adds the entry to an existing plugins object without disturbing other plugins', () => {
    const source = `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
    const result = patchPostcssConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('tailwindcss: {}');
    expect(result.code).toContain('autoprefixer: {}');
    expect(result.code).toContain("'@kbach/react/postcss': {}");
  });

  it('supports the export default {} ESM shape (postcss.config.mjs)', () => {
    const source = `export default {\n  plugins: {\n    tailwindcss: {},\n  },\n};\n`;
    const result = patchPostcssConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("'@kbach/react/postcss': {}");
  });

  // Confirmed live against a real `npx create-next-app@latest` scaffold
  // (Next 16 + Tailwind v4 template) — this is its actual default
  // postcss.config.mjs, not a hypothetical shape.
  it('supports "const config = {...}; export default config;" (the real create-next-app default)', () => {
    const source = `const config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n\nexport default config;\n`;
    const result = patchPostcssConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.code).toContain('@tailwindcss/postcss');
    expect(result.code).toContain("'@kbach/react/postcss': {}");
  });

  it('supports the same const-then-export-default shape for module.exports too', () => {
    const source = `const config = {\n  plugins: {},\n};\n\nmodule.exports = config;\n`;
    const result = patchPostcssConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("'@kbach/react/postcss': {}");
  });

  it('supports an array-shaped plugins list', () => {
    const source = `module.exports = {\n  plugins: ['tailwindcss', 'autoprefixer'],\n};\n`;
    const result = patchPostcssConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain("'tailwindcss'");
    expect(result.code).toContain("'@kbach/react/postcss'");
  });

  it('is a no-op when already present', () => {
    const first = patchPostcssConfig('module.exports = {};\n');
    if (!first.ok) throw new Error('expected ok');
    const second = patchPostcssConfig(first.code);
    expect(second).toEqual({ ok: true, changed: false, code: first.code });
  });

  it('reports ok:false for a call-wrapped export rather than guessing', () => {
    const source = `module.exports = withTailwind({ plugins: {} });\n`;
    const result = patchPostcssConfig(source);
    expect(result.ok).toBe(false);
  });
});

describe('isPostcssConfigWired', () => {
  it('is false before patching and true after', () => {
    expect(isPostcssConfigWired('module.exports = {};\n')).toEqual({ ok: true, wired: false });
    const patched = patchPostcssConfig('module.exports = {};\n');
    if (!patched.ok) throw new Error('expected ok');
    expect(isPostcssConfigWired(patched.code)).toEqual({ ok: true, wired: true });
  });
});
