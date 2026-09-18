import { describe, it, expect } from 'vitest';
import { ensureKbachCssMarkers } from './globalsCssMarkers';

describe('ensureKbachCssMarkers', () => {
  it('appends the marker pair to a file that has none', () => {
    const result = ensureKbachCssMarkers('@tailwind base;\n');
    expect(result.changed).toBe(true);
    expect(result.code).toContain('/* kbach:start */');
    expect(result.code).toContain('/* kbach:end */');
    expect(result.code.startsWith('@tailwind base;\n')).toBe(true);
  });

  it('appends the marker pair to a completely empty file', () => {
    const result = ensureKbachCssMarkers('');
    expect(result.changed).toBe(true);
    expect(result.code).toBe('/* kbach:start */\n/* kbach:end */\n');
  });

  it('is a no-op and never touches existing content between an already-present pair', () => {
    const source = ':root {\n  --x: 1;\n}\n\n/* kbach:start */\n.kb-generated { color: red; }\n/* kbach:end */\n';
    const result = ensureKbachCssMarkers(source);
    expect(result.changed).toBe(false);
    expect(result.code).toBe(source);
  });
});
