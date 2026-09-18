import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkConfigSyntax } from './configSyntax';

describe('checkConfigSyntax', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-cli-config-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null (not applicable) when there is no kbach.config.js at all', () => {
    expect(checkConfigSyntax(dir)).toBeNull();
  });

  it('passes for a valid CJS config', () => {
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { darkMode: 'attribute' };\n");
    expect(checkConfigSyntax(dir)).toEqual({ label: 'kbach.config.js parses', status: 'pass' });
  });

  it('fails and hints at quoting for the documented unquoted-hyphenated-key trap', () => {
    writeFileSync(
      dir + '/kbach.config.js',
      "module.exports = { extend: { colors: { surface-dim: '#121318' } } };\n",
    );
    const result = checkConfigSyntax(dir);
    expect(result?.status).toBe('fail');
    expect(result?.fix).toContain('quote it');
  });
});
