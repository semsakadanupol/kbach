import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigFile, rootsDependingOn } from './kbachConfigLoader';

describe('loadConfigFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-vscode-config-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns undefined when no kbach.config.* exists', async () => {
    await expect(loadConfigFile(dir)).resolves.toBeUndefined();
  });

  it('loads kbach.config.js via require() (CommonJS, the default with no package.json "type" field)', async () => {
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');
    const config = await loadConfigFile(dir);
    expect(config?.extend?.colors).toEqual({ brand: '#ff6b35' });
  });

  it('always loads kbach.config.cjs via require(), regardless of module type', async () => {
    writeFileSync(join(dir, 'kbach.config.cjs'), "module.exports = { darkMode: 'class' };", 'utf-8');
    const config = await loadConfigFile(dir);
    expect(config?.darkMode).toBe('class');
  });

  it('always loads kbach.config.mjs via a real import()', async () => {
    writeFileSync(join(dir, 'kbach.config.mjs'), "export default { darkMode: 'attribute' };", 'utf-8');
    const config = await loadConfigFile(dir);
    expect(config?.darkMode).toBe('attribute');
  });

  it('prefers kbach.config.cjs over a sibling kbach.config.js', async () => {
    writeFileSync(join(dir, 'kbach.config.cjs'), "module.exports = { darkMode: 'class' };", 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { darkMode: 'media' };", 'utf-8');
    const config = await loadConfigFile(dir);
    expect(config?.darkMode).toBe('class');
  });

  it('falls back to a real import() for kbach.config.js in an ESM-type project ("type": "module")', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "export default { extend: { colors: { brand: '#abc' } } };", 'utf-8');
    const config = await loadConfigFile(dir);
    expect(config?.extend?.colors).toEqual({ brand: '#abc' });
  });

  it("re-reads a require()d helper on reload — not just the config file's own cache entry", async () => {
    writeFileSync(join(dir, 'colors.js'), "module.exports = { brand: '#111111' };", 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: require('./colors') } };", 'utf-8');
    expect((await loadConfigFile(dir))?.extend?.colors).toEqual({ brand: '#111111' });
    writeFileSync(join(dir, 'colors.js'), "module.exports = { brand: '#222222' };", 'utf-8');
    expect((await loadConfigFile(dir))?.extend?.colors).toEqual({ brand: '#222222' });
  });

  it("tracks the config's own project-local require()s, so a change to a helper can invalidate that root", async () => {
    writeFileSync(join(dir, 'colors.js'), "module.exports = { brand: '#111111' };", 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: require('./colors') } };", 'utf-8');
    await loadConfigFile(dir);
    expect(rootsDependingOn(join(dir, 'colors.js'))).toEqual([dir]);
    expect(rootsDependingOn(join(dir, 'kbach.config.js'))).toEqual([dir]);
    expect(rootsDependingOn(join(dir, 'unrelated.js'))).toEqual([]);
  });

  it('falls back to import() for an ESM kbach.config.js that uses top-level await (ERR_REQUIRE_ASYNC_MODULE on Node 22.12+)', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');
    writeFileSync(join(dir, 'tokens.js'), "export const brand = '#abcdef';", 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "const { brand } = await import('./tokens.js');\nexport default { extend: { colors: { brand } } };", 'utf-8');
    const config = await loadConfigFile(dir);
    expect(config?.extend?.colors).toEqual({ brand: '#abcdef' });
  });
});
