import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_THEME, WEB_DEFAULT_THEME } from './defaultTheme';

describe('WEB_DEFAULT_THEME', () => {
  it("matches @kbach/react's own defaultTheme extras (packages/react/src/theme.ts) — drift guard", () => {
    const source = readFileSync(join(__dirname, '..', '..', 'react', 'src', 'theme.ts'), 'utf-8');
    const block = /export const defaultTheme[\s\S]*?colors:\s*\{([\s\S]*?)\n\s*\},/.exec(source);
    expect(block, 'could not find defaultTheme.colors in packages/react/src/theme.ts').not.toBeNull();
    // every entry other than the ...PALETTE spread
    const extras = block![1]!.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('...') && !l.startsWith('//'));
    expect(extras).toEqual([`surface: { light: '${(WEB_DEFAULT_THEME.colors.surface as { light: string }).light}', dark: '${(WEB_DEFAULT_THEME.colors.surface as { dark: string }).dark}' },`]);
  });

  it('differs from the binding-agnostic default only by that extra color', () => {
    const { surface, ...rest } = WEB_DEFAULT_THEME.colors;
    expect(surface).toBeDefined();
    expect(rest).toEqual(DEFAULT_THEME.colors);
    expect({ ...WEB_DEFAULT_THEME, colors: null }).toEqual({ ...DEFAULT_THEME, colors: null });
  });
});
