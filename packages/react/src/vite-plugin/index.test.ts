import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { kbach, CSS_SYNC_DEBOUNCE_MS } from './index';

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
    vi.useFakeTimers();
    (plugin.handleHotUpdate as unknown as (ctx: { file: string; server: typeof fakeServer }) => void)({
      file: forwardSlashPath,
      server: fakeServer,
    });
    vi.advanceTimersByTime(CSS_SYNC_DEBOUNCE_MS);
    vi.useRealTimers();

    css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: block');
    expect(css).not.toContain('display: flex');
  });
});

describe('kbach() plugin — kbach.config.js auto-discovery', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('auto-discovers kbach.config.js at the project root when neither theme nor config is passed', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    writeFileSync(
      join(dir, 'kbach.config.js'),
      "module.exports = { extend: { colors: { brand: '#ff6b35' } } };",
      'utf-8',
    );

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    // The static CSS build extracts every theme color into a `:root`
    // variable (cssVars.ts) — the RGB triplet, not the literal hex, is
    // what actually shows up in the `.bg-brand` rule itself.
    expect(css).toContain('--color-brand-rgb: 255,107,53');
    expect(css).toContain('.bg-brand');
    expect(css).toContain('rgba(var(--color-brand-rgb)');
  });

  it('an explicit config option always wins over auto-discovery', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    writeFileSync(
      join(dir, 'kbach.config.js'),
      "module.exports = { extend: { colors: { brand: '#ff6b35' } } };",
      'utf-8',
    );

    const plugin = kbach({ config: { extend: { colors: { brand: '#000000' } } } });
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('--color-brand-rgb: 0,0,0');
    expect(css).not.toContain('255,107,53'); // the config file's own brand never took effect
  });

  it('is a silent no-op when no kbach.config.js exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: flex');
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
    vi.useFakeTimers();
    (plugin.handleHotUpdate as unknown as (ctx: { file: string; server: typeof fakeServer }) => void)({
      file: appFile,
      server: fakeServer,
    });
    vi.advanceTimersByTime(CSS_SYNC_DEBOUNCE_MS);
    vi.useRealTimers();

    css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('button { appearance: none');
  });
});

describe('kbach() plugin — safelist option', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('includes a safelisted class even when no scanned source file references it', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach({ safelist: ['sr-only'] });
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('.sr-only');
  });

  it('omits a class that is neither scanned nor safelisted', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).not.toContain('.sr-only');
  });
});

// configureServer wires up 'add'/'unlink' watcher events — separate from
// handleHotUpdate above, which Vite only fires for edits (type === "update")
// to an already-existing file, never for a file being created or deleted.
describe('kbach() plugin — configureServer add/unlink handling', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // Minimal fake mirroring the one piece of Vite's dev-server `watcher`
  // this plugin actually uses: registering 'add'/'unlink' listeners
  // (configureServer) and later emitting 'change' to itself
  // (syncMainCSSFile, on every sync — asserted separately from the emitted
  // event's effect, which is Vite's own concern, not this plugin's).
  function fakeServer() {
    const listeners: Record<string, ((file: string) => void)[]> = {};
    return {
      watcher: {
        on(event: string, cb: (file: string) => void) {
          (listeners[event] ??= []).push(cb);
        },
        emit: () => undefined,
      },
      trigger(event: string, file: string) {
        for (const cb of listeners[event] ?? []) cb(file);
      },
    };
  }

  it('adds a newly created file\'s classes to kbach.css', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const server = fakeServer();
    (plugin.configureServer as unknown as (s: typeof server) => void)(server);

    const newFile = join(dir, 'src', 'New.tsx');
    writeFileSync(newFile, '<div className="italic" />', 'utf-8');
    vi.useFakeTimers();
    server.trigger('add', newFile);
    vi.advanceTimersByTime(CSS_SYNC_DEBOUNCE_MS);
    vi.useRealTimers();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('font-style: italic');
  });

  it("removes a deleted file's classes from kbach.css", () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');
    const goingAwayFile = join(dir, 'src', 'GoingAway.tsx');
    writeFileSync(goingAwayFile, '<div className="italic" />', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    let css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('font-style: italic');

    const server = fakeServer();
    (plugin.configureServer as unknown as (s: typeof server) => void)(server);
    rmSync(goingAwayFile);
    vi.useFakeTimers();
    server.trigger('unlink', goingAwayFile);
    vi.advanceTimersByTime(CSS_SYNC_DEBOUNCE_MS);
    vi.useRealTimers();

    css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).not.toContain('font-style: italic');
    expect(css).toContain('display: flex');
  });

  it('ignores non-JS/TSX files and anything under node_modules', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    (plugin.configResolved as (r: { root: string }) => void)({ root: dir });
    (plugin.buildStart as () => void)();

    const server = fakeServer();
    (plugin.configureServer as unknown as (s: typeof server) => void)(server);

    // Neither call should throw or touch kbach.css, despite matching
    // filenames that don't exist on disk — the extension/path guards must
    // reject them before any read is attempted.
    expect(() => server.trigger('add', join(dir, 'src', 'notes.md'))).not.toThrow();
    expect(() => server.trigger('add', join(dir, 'node_modules', 'x', 'index.tsx'))).not.toThrow();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: flex');
  });
});
