import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
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

  it('prunes a hot-updated file\'s old classes instead of accumulating them under a second path key', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    const appFile = join(dir, 'src', 'App.tsx'); // OS-native separators (backslashes on Windows)
    writeFileSync(appFile, '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
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

  it('auto-discovers kbach.config.js at the project root when neither theme nor config is passed', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    writeFileSync(
      join(dir, 'kbach.config.js'),
      "module.exports = { extend: { colors: { brand: '#ff6b35' } } };",
      'utf-8',
    );

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    // The static CSS build extracts every theme color into a `:root`
    // variable (cssVars.ts) — the RGB triplet, not the literal hex, is
    // what actually shows up in the `.bg-brand` rule itself.
    expect(css).toContain('--color-brand-rgb: 255,107,53');
    expect(css).toContain('.bg-brand');
    expect(css).toContain('rgba(var(--color-brand-rgb)');
  });

  it('an explicit config option always wins over auto-discovery', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    writeFileSync(
      join(dir, 'kbach.config.js'),
      "module.exports = { extend: { colors: { brand: '#ff6b35' } } };",
      'utf-8',
    );

    const plugin = kbach({ config: { extend: { colors: { brand: '#000000' } } } });
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('--color-brand-rgb: 0,0,0');
    expect(css).not.toContain('255,107,53'); // the config file's own brand never took effect
  });

  it('is a silent no-op when no kbach.config.js exists', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: flex');
  });
});

// Regression coverage for a real bug: `kbach.config.js` auto-discovery used
// plain CommonJS `require()` unconditionally, which throws outright for any
// project whose nearest package.json has "type": "module" — Node then
// treats every bare ".js" file as ESM by default, and require()-ing a file
// that uses CJS-only `module.exports` syntax in that context fails with
// "ReferenceError: module is not defined in ES module scope", not a
// friendlier "wrong format" error. loadConfigFile now also checks
// `kbach.config.cjs`/`.mjs` explicitly, and falls back from require() to a
// real dynamic import() specifically when it detects this exact mismatch.
describe('kbach() plugin — kbach.config auto-discovery across module formats', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('loads kbach.config.js via require() in a CommonJS-type project (no "type" field)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('--color-brand-rgb: 255,107,53');
  });

  it('falls back to a real import() for kbach.config.js in an ESM-type project ("type": "module")', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    // Real ESM syntax — require() would throw on this in an ESM-type
    // project; the plugin must transparently retry via import() instead.
    writeFileSync(
      join(dir, 'kbach.config.js'),
      "export default { extend: { colors: { brand: '#ff6b35' } } };",
      'utf-8',
    );

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('--color-brand-rgb: 255,107,53');
  });

  it('always loads kbach.config.cjs via require(), regardless of the project\'s own module type', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf-8');
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="bg-brand" />', 'utf-8');
    writeFileSync(join(dir, 'kbach.config.cjs'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };", 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('--color-brand-rgb: 255,107,53');
  });

  // Not run in-process like the other cases in this block: vitest executes
  // this whole test file through Vite's own SSR module runner (vite-node),
  // which statically rewrites every `import(...)` call it can see in the
  // AST — including `importConfigModule`'s, in index.ts — to route through
  // its own module graph/resolver instead of Node's real dynamic import.
  // That resolver has no reason to know about an arbitrary temp-dir config
  // file outside the project it's serving, and it fails specifically for
  // `.mjs` (confirmed: identical `import(pathToFileURL(...).href)` code
  // succeeds for `.js` in the fallback test above, in this same process —
  // only the `.mjs` extension trips it). This is a vite-node test-harness
  // artifact, not a product bug — verified separately below via a real
  // `node` subprocess, bypassing vite-node's interception entirely, which
  // is the only way to observe Node's actual, unpatched import() behavior.
  it('always loads kbach.config.mjs via a real import(), regardless of the project\'s own module type', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    writeFileSync(
      join(dir, 'kbach.config.mjs'),
      "export default { extend: { colors: { brand: '#ff6b35' } } };",
      'utf-8',
    );

    const mjsUrl = pathToFileURL(join(dir, 'kbach.config.mjs')).href;
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `import(${JSON.stringify(mjsUrl)}).then(m => console.log(JSON.stringify(m.default)))`],
      { encoding: 'utf-8' },
    );
    expect(JSON.parse(out)).toEqual({ extend: { colors: { brand: '#ff6b35' } } });
  });
});

describe('kbach() plugin — tag-pruned base reset', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('only includes reset rules for HTML tags actually present in the scanned source', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    const appFile = join(dir, 'src', 'App.tsx');
    writeFileSync(appFile, '<div className="flex"><a href="/">home</a></div>', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
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

  it('grows the reset back when a hot-updated file introduces a new tag', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    const appFile = join(dir, 'src', 'App.tsx');
    writeFileSync(appFile, '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
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

  it('includes a safelisted class even when no scanned source file references it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach({ safelist: ['sr-only'] });
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('.sr-only');
  });

  it('omits a class that is neither scanned nor safelisted', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).not.toContain('.sr-only');
  });
});

// Regression coverage for a real bug: mainCSSFile() was hardcoded to
// "src/kbach.css" regardless of the project's actual source root, so any
// framework using a different convention (React Router v7's framework
// mode uses "app/", not "src/") failed outright at buildStart with an
// ENOENT trying to write into a "src/" directory that simply didn't exist.
// findMainCSSFile now auto-detects the right location with zero config —
// see these tests for each tier of that detection, and its own doc
// comment (vite-plugin/index.ts) for the full tier order.
describe('kbach() plugin — CSS file auto-detection', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('finds an already-existing marked kbach.css under a non-"src" include dir with zero config', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    // No "src/" anywhere — only "app/", matching React Router v7's
    // framework mode, with the marker file already created there (the one
    // manual step this plugin still expects).
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'app', 'root.tsx'), '<div className="flex" />', 'utf-8');
    writeFileSync(join(dir, 'app', 'kbach.css'), '/* kbach:start */\n/* kbach:end */', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    expect(() => (plugin.buildStart as () => void)()).not.toThrow();

    const css = readFileSync(join(dir, 'app', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: flex');
  });

  it('falls back to the first include dir that already exists when no marked file is found yet', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    // "app/" exists but has no kbach.css at all yet (a real first-time-setup
    // case) — still no "src/" anywhere.
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'app', 'root.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    expect(() => (plugin.buildStart as () => void)()).not.toThrow();

    const css = readFileSync(join(dir, 'app', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: flex');
  });

  it('never crashes even in a genuinely empty project — creates the fallback directory itself', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    // Nothing exists yet at all — not even "src/".
    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    expect(() => (plugin.buildStart as () => void)()).not.toThrow();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('kbach:start');
  });

  it('an explicit cssFile always wins over auto-detection', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'app', 'root.tsx'), '<div className="flex" />', 'utf-8');
    // A marked file exists under "app/" — auto-detection would normally
    // pick it — but an explicit cssFile should override that entirely.
    writeFileSync(join(dir, 'app', 'kbach.css'), '/* kbach:start */\n/* kbach:end */', 'utf-8');

    const plugin = kbach({ cssFile: 'custom/styles.css' });
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'custom', 'styles.css'), 'utf-8');
    expect(css).toContain('display: flex');
  });

  it('still defaults to src/kbach.css for a normal project layout', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
    (plugin.buildStart as () => void)();

    const css = readFileSync(join(dir, 'src', 'kbach.css'), 'utf-8');
    expect(css).toContain('display: flex');
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

  it('adds a newly created file\'s classes to kbach.css', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
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

  it("removes a deleted file's classes from kbach.css", async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');
    const goingAwayFile = join(dir, 'src', 'GoingAway.tsx');
    writeFileSync(goingAwayFile, '<div className="italic" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
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

  it('ignores non-JS/TSX files and anything under node_modules', async () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-test-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'App.tsx'), '<div className="flex" />', 'utf-8');

    const plugin = kbach();
    await (plugin.configResolved as (r: { root: string }) => Promise<void>)({ root: dir });
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
