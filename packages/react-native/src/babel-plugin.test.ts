import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const kbachBabelPlugin = require('./babel-plugin.js');

// Unit-level: invokes the plugin's pre(file) hook directly against a
// minimal mock `file` object (matching only the shape the plugin actually
// reads — file.opts.filename, file.ast.comments) rather than running a full
// @babel/core transform, keeping this test fast and dependency-free.
function fakeFile(filename: string, existingComments: { type: string; value: string }[] = []) {
  return {
    opts: { filename },
    ast: { comments: existingComments },
  };
}

describe('babel-plugin (react-native)', () => {
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
});
