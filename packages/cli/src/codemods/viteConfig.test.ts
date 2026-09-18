import { describe, it, expect } from 'vitest';
import { patchViteConfig, isViteConfigWired } from './viteConfig';

const UNWIRED = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;

describe('patchViteConfig', () => {
  it('inserts the import and kbach() before react() in a plain defineConfig({ plugins }) call', () => {
    const result = patchViteConfig(UNWIRED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.code).toContain("import { kbach } from '@kbach/react/vite';");
    expect(result.code).toMatch(/plugins:\s*\[kbach\(\),\s*react\(\)\]/);
  });

  it('is a no-op (changed: false) when already wired up', () => {
    const first = patchViteConfig(UNWIRED);
    if (!first.ok) throw new Error('expected ok');
    const second = patchViteConfig(first.code);
    expect(second).toEqual({ ok: true, changed: false, code: first.code });
  });

  it('respects an existing import under a different local name instead of adding a duplicate import', () => {
    const source = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach as myKbach } from '@kbach/react/vite';

export default defineConfig({
  plugins: [react()],
});
`;
    const result = patchViteConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    // Only ever inserted once — no second '@kbach/react/vite' import line.
    expect(result.code.match(/@kbach\/react\/vite/g)).toHaveLength(1);
    expect(result.code).toMatch(/plugins:\s*\[myKbach\(\),\s*react\(\)\]/);
  });

  it('inserts at the front of plugins when no react() call is present to anchor before', () => {
    const source = `import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [someOtherPlugin()],
});
`;
    const result = patchViteConfig(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toMatch(/plugins:\s*\[kbach\(\),\s*someOtherPlugin\(\)\]/);
  });

  it('reports ok:false rather than guessing when there is no defineConfig(...) call', () => {
    const source = `export default { plugins: [] };\n`;
    const result = patchViteConfig(source);
    expect(result).toEqual({ ok: false, reason: 'no defineConfig(...) call found' });
  });

  it('reports ok:false rather than guessing when defineConfig(...) has no plain "plugins" array', () => {
    const source = `import { defineConfig } from 'vite';
const opts = { plugins: [] };
export default defineConfig(opts);
`;
    const result = patchViteConfig(source);
    expect(result.ok).toBe(false);
  });
});

describe('isViteConfigWired', () => {
  it('is false for an unwired config', () => {
    expect(isViteConfigWired(UNWIRED)).toEqual({ ok: true, wired: false });
  });

  it('is true after patching', () => {
    const patched = patchViteConfig(UNWIRED);
    if (!patched.ok) throw new Error('expected ok');
    expect(isViteConfigWired(patched.code)).toEqual({ ok: true, wired: true });
  });
});
