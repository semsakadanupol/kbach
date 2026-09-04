import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const kbachBabelPlugin = require('./babel-plugin.js');

// Unit-level: invokes the plugin's pre(file) hook directly against a
// minimal mock `file` object (matching only the shape the plugin actually
// reads — file.opts.filename, file.ast.comments, file.ast.program.body)
// rather than running a full @babel/core transform, keeping this test fast
// and dependency-free.
function fakeFile(filename: string, existingComments: { type: string; value: string }[] = []) {
  return {
    opts: { filename },
    ast: { comments: existingComments, program: { body: [] as unknown[] } },
  };
}

describe('babel-plugin (react-native) — jsxImportSource pragma', () => {
  it('injects the jsxImportSource pragma for a user file', () => {
    const plugin = kbachBabelPlugin();
    const file = fakeFile('/app/src/App.tsx');
    plugin.pre(file);
    expect(file.ast.comments[0]!.value).toContain('@jsxImportSource @kbach/react-native');
  });

  it('does not inject a pragma for a node_modules file', () => {
    const plugin = kbachBabelPlugin();
    const file = fakeFile('/app/node_modules/some-lib/index.js');
    plugin.pre(file);
    expect(file.ast.comments).toHaveLength(0);
  });

  it('does not inject a duplicate pragma if one is already present', () => {
    const plugin = kbachBabelPlugin();
    const file = fakeFile('/app/src/App.tsx', [{ type: 'CommentLine', value: ' @jsxImportSource react' }]);
    plugin.pre(file);
    expect(file.ast.comments).toHaveLength(1);
  });

  it('does not touch a Metro/Expo virtual module (a NUL byte embedded mid-path)', () => {
    // Regression test for a real runtime crash: Expo's own Metro config
    // marks internal polyfills (the Node.js-external-require shim, etc.)
    // with a synthetic "\0polyfill:..." virtual module ID, which Metro
    // then joins onto the project root before passing it to Babel as
    // `filename` — so the real value looks like
    // "<projectRoot>\\\0polyfill:external-require", NUL embedded in the
    // MIDDLE of the string, confirmed by actually logging Babel's real
    // `filename` for this exact file rather than assumed. Never inside
    // node_modules, so the OTHER exclusion check doesn't catch it either.
    // Metro places these directly in the bundle prelude, outside any
    // wrapped module, where injecting our require()-based auto-apply
    // statement produced "[runtime not ready]: ReferenceError: Property
    // 'require' doesn't exist" at app startup.
    const plugin = kbachBabelPlugin();
    const file = fakeFile('/app/\0polyfill:external-require');
    plugin.pre(file);
    expect(file.ast.comments).toHaveLength(0);
    expect(file.ast.program.body).toHaveLength(0);
  });
});

describe('babel-plugin (react-native) — kbach.config.js auto-application', () => {
  let dir: string;

  beforeEach(() => {
    kbachBabelPlugin._resetForTests();
  });

  afterEach(() => {
    kbachBabelPlugin._resetForTests();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('injects an applyKbachConfig() call when kbach.config.js exists at configRoot', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));
    writeFileSync(join(dir, 'kbach.config.js'), "module.exports = { extend: { colors: { brand: '#ff6b35' } } };");

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    const file = fakeFile(join(dir, 'App.tsx'));
    plugin.pre(file);

    expect(file.ast.program.body).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const generate = require('@babel/generator').default;
    const code = generate(file.ast.program.body[0]).code;
    expect(code).toContain('applyKbachConfig');
    expect(code).toContain('kbach.config.js');
  });

  it('injects nothing when no kbach.config.js exists at configRoot', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    const file = fakeFile(join(dir, 'App.tsx'));
    plugin.pre(file);

    expect(file.ast.program.body).toHaveLength(0);
  });

  it('does not inject into a node_modules file even when kbach.config.js exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));
    writeFileSync(join(dir, 'kbach.config.js'), 'module.exports = {};');

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    const file = fakeFile(join(dir, 'node_modules', 'some-lib', 'index.js'));
    plugin.pre(file);

    expect(file.ast.program.body).toHaveLength(0);
  });

  it('only checks the filesystem once per root, not per file', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));
    writeFileSync(join(dir, 'kbach.config.js'), 'module.exports = {};');

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    plugin.pre(fakeFile(join(dir, 'A.tsx')));
    // Removing the config file after the first file must NOT affect a
    // SECOND file checked against the same root — the check is cached per
    // root, matching "a Babel-plugin-level change needs a dev-server
    // restart anyway."
    rmSync(join(dir, 'kbach.config.js'));
    const second = fakeFile(join(dir, 'B.tsx'));
    plugin.pre(second);
    expect(second.ast.program.body).toHaveLength(1);
  });

  it('gives each file its OWN AST statement node, never the same shared reference', () => {
    // Regression test for a real bundling failure: an earlier version
    // cached and reused the SAME AST node across every file's pre() call.
    // Babel mutates a node in place as its own file's transform runs
    // (location info, scope bindings, ...), so sharing one instance
    // across files corrupted it after the first one — Metro's dependency
    // collector then rejected a LATER file's copy with "Invalid call at
    // line <unknown>" for its require() call. Two structurally-identical
    // but reference-DISTINCT nodes is the fix; asserting reference
    // inequality is what actually catches a regression back to sharing.
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));
    writeFileSync(join(dir, 'kbach.config.js'), 'module.exports = {};');

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    const fileA = fakeFile(join(dir, 'A.tsx'));
    const fileB = fakeFile(join(dir, 'B.tsx'));
    plugin.pre(fileA);
    plugin.pre(fileB);

    expect(fileA.ast.program.body[0]).not.toBe(fileB.ast.program.body[0]);
  });

  it('does not inject the auto-apply statement into kbach.config.js itself', () => {
    // A config file requiring its OWN absolute path (a real self-reference
    // cycle in Metro's dependency graph) is nonsensical regardless of the
    // shared-node bug above — this must never happen even once that's fixed.
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));
    writeFileSync(join(dir, 'kbach.config.js'), 'module.exports = {};');

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    const configFile = fakeFile(join(dir, 'kbach.config.js'));
    plugin.pre(configFile);

    expect(configFile.ast.program.body).toHaveLength(0);
  });

  it('does not inject the auto-apply statement into a virtual module even when kbach.config.js exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));
    writeFileSync(join(dir, 'kbach.config.js'), 'module.exports = {};');

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    const file = fakeFile(join(dir, '\0polyfill:external-require'));
    plugin.pre(file);

    expect(file.ast.program.body).toHaveLength(0);
  });

  it('still injects into an ordinary file even after kbach.config.js itself was skipped', () => {
    dir = mkdtempSync(join(tmpdir(), 'kbach-babel-test-'));
    writeFileSync(join(dir, 'kbach.config.js'), 'module.exports = {};');

    const plugin = kbachBabelPlugin(undefined, { configRoot: dir });
    plugin.pre(fakeFile(join(dir, 'kbach.config.js')));
    const appFile = fakeFile(join(dir, 'App.tsx'));
    plugin.pre(appFile);

    expect(appFile.ast.program.body).toHaveLength(1);
  });

  it('defaults configRoot to process.cwd() when no options are passed', () => {
    // No kbach.config.js at this repo's own package root — confirms the
    // default path is exercised (not just the configRoot override) without
    // actually depending on this package's cwd having (or not having) a
    // real config file.
    const plugin = kbachBabelPlugin();
    const file = fakeFile(join(process.cwd(), 'App.tsx'));
    expect(() => plugin.pre(file)).not.toThrow();
  });
});
