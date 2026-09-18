import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findGlobalsCssFile } from './findGlobalsCss';

describe('findGlobalsCssFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-cli-globals-css-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when none of the candidate paths exist', () => {
    expect(findGlobalsCssFile(dir)).toBeNull();
  });

  it('finds app/globals.css (App Router)', () => {
    mkdirSync(join(dir, 'app'), { recursive: true });
    const path = join(dir, 'app/globals.css');
    writeFileSync(path, '');
    expect(findGlobalsCssFile(dir)).toBe(path);
  });

  it('finds src/app/globals.css (App Router under src/)', () => {
    mkdirSync(join(dir, 'src/app'), { recursive: true });
    const path = join(dir, 'src/app/globals.css');
    writeFileSync(path, '');
    expect(findGlobalsCssFile(dir)).toBe(path);
  });

  it('finds styles/globals.css (Pages Router)', () => {
    mkdirSync(join(dir, 'styles'), { recursive: true });
    const path = join(dir, 'styles/globals.css');
    writeFileSync(path, '');
    expect(findGlobalsCssFile(dir)).toBe(path);
  });

  it('finds src/styles/globals.css (Pages Router under src/)', () => {
    // Reported live: a real project with global styles kept under
    // src/styles/ (separate from src/pages/) was invisible to `init`,
    // which fell back to "none found" even though the file already had
    // both marker comments in place.
    mkdirSync(join(dir, 'src/styles'), { recursive: true });
    const path = join(dir, 'src/styles/globals.css');
    writeFileSync(path, '/* kbach:start */\n/* kbach:end */\n');
    expect(findGlobalsCssFile(dir)).toBe(path);
  });
});
