import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { kbach } from './index';

// Regression coverage for a real bug: Vite's handleHotUpdate/watcher events
// always report forward-slash absolute paths (Vite's own convention, on
// every OS), while the initial scan's path.join produces OS-native
// separators — backslashes on Windows. Without normalizing both to the same
// key before touching `fileTokens`, an edited file gets a SECOND Map entry
// instead of replacing its original one, so its old classes are never
// pruned and silently keep reappearing in kbach.css forever, even after
// they're removed from source — exactly what happened with a shadow color
// left over from an earlier version of a demo page. See index.ts's
// `normPath` for the fix.
describe('kbach() plugin — file path normalization', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('prunes a hot-updated file\'s old classes instead of accumulating them under a second path key', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    const appFile = join(dir, 'src', 'App.tsx'); // OS-native separators (backslashes on Windows)
    writeFileSync(appFile, '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    let css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: flex');

    // Edit the file, then hot-update it via a forward-slash path — Vite's
    // own convention, regardless of OS — deliberately NOT the same string
    // as `appFile` on Windows, to reproduce the real mismatch.
    writeFileSync(appFile, '<div className="block" />', 'utf-8');
    const forwardSlashPath = appFile.replace(/\\/g, '/');
    const fakeServer = { watcher: { emit: () => undefined } };
    (plugin.handleHotUpdate as unknown as (ctx: { file: string; server: typeof fakeServer }) => void)({
      file: forwardSlashPath,
      server: fakeServer,
    });

    css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: block');
    expect(css).not.toContain('display: flex');
  });
});

describe('kbach() plugin — tag-pruned base reset', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('only includes reset rules for HTML tags actually present in the scanned source', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    const appFile = join(dir, 'src', 'App.tsx');
    writeFileSync(appFile, '<div className="flex"><a href="/">home</a></div>', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    // Universal rules always present.
    expect(css).toContain('box-sizing: border-box');
    // <a> is used — its reset rule is included.
    expect(css).toContain('a { color: inherit; text-decoration: none; }');
    // No <button>/<select>/<table> anywhere in source — their rules are pruned.
    expect(css).not.toContain('button { appearance: none');
    expect(css).not.toContain('select { margin: 0');
    expect(css).not.toContain('table { border-collapse');
  });

  it('grows the reset back when a hot-updated file introduces a new tag', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    const appFile = join(dir, 'src', 'App.tsx');
    writeFileSync(appFile, '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    let css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).not.toContain('button { appearance: none');

    writeFileSync(appFile, '<div className="flex"><button>go</button></div>', 'utf-8');
    const fakeServer = { watcher: { emit: () => undefined } };
    (plugin.handleHotUpdate as unknown as (ctx: { file: string; server: typeof fakeServer }) => void)({
      file: appFile,
      server: fakeServer,
    });

    css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('button { appearance: none');
  });
});
