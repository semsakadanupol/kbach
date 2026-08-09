import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { transformSync } from '@babel/core';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const kbachBabelPlugin = require('./index.js');

// No kbach.config.js exists at this test's cwd, so the plugin falls back to
// the default theme and warns once (cached after) — expected, not a signal
// this test is checking.
let warnSpy: any;
beforeAll(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterAll(() => { warnSpy.mockRestore(); });

// Regression coverage for a fixed bug: when the FIRST of two class-bearing
// attributes on one element (e.g. `kb="group" className="p-4 bg-white"`)
// resolved to zero styles on its own (like `group`, a standalone marker with
// no styles of its own), the merge-tracking map (state.kbachElementInfo)
// never got populated for that element — it fell through an early `return`
// before the `.set()` call. The second attribute then never saw `existing`,
// transformed itself in isolation, and the first attribute was left
// completely untouched in the output (never renamed/removed), producing a
// stray `kb="group"` prop reaching the real component at runtime instead of
// being folded into the merge like the plugin's own doc comment promises.

function transform(code: string): string {
  const result = transformSync(code, {
    filename: '/project/src/App.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['jsx'] },
    plugins: [kbachBabelPlugin],
  });
  if (!result?.code) throw new Error('transform produced no output');
  return result.code;
}

describe('babel-plugin-kbach — merging multiple class attributes on one element', () => {
  it('merges two attributes that both have styles (baseline, already worked)', () => {
    const out = transform(`<View kb="p-4" className="bg-white" />;`);
    expect(out).not.toContain('kb=');
    expect(out).not.toContain('className=');
    expect(out.match(/__kbachClasses/g)?.length).toBe(1);
    expect(out.match(/__kbachStyles/g)?.length).toBe(1);
    expect(out).toContain('__kbachClasses="p-4 bg-white"');
  });

  it('merges when the FIRST attribute alone resolves to no styles (the fixed bug)', () => {
    const out = transform(`<View kb="group" className="p-4 bg-white" />;`);
    // The first, styleless attribute must be folded away, not left dangling.
    expect(out).not.toContain('kb=');
    expect(out).not.toContain('className=');
    // Exactly one merged pair, carrying BOTH classes.
    expect(out.match(/__kbachClasses/g)?.length).toBe(1);
    expect(out.match(/__kbachStyles/g)?.length).toBe(1);
    expect(out).toContain('__kbachClasses="group p-4 bg-white"');
  });

  it('merges when the SECOND attribute alone resolves to no styles', () => {
    const out = transform(`<View kb="p-4 bg-white" className="group" />;`);
    expect(out).not.toContain('kb=');
    expect(out).not.toContain('className=');
    expect(out.match(/__kbachClasses/g)?.length).toBe(1);
    expect(out.match(/__kbachStyles/g)?.length).toBe(1);
    expect(out).toContain('__kbachClasses="p-4 bg-white group"');
  });

  it('leaves both attributes untouched when NEITHER resolves to any styles', () => {
    const out = transform(`<View kb="group" className="peer" />;`);
    expect(out).toContain('kb="group"');
    expect(out).toContain('className="peer"');
    expect(out).not.toContain('__kbachClasses');
    expect(out).not.toContain('__kbachStyles');
  });

  it('a single class attribute with styles still transforms normally (no merge involved)', () => {
    const out = transform(`<View className="p-4" />;`);
    expect(out).not.toContain('className=');
    expect(out).toContain('__kbachClasses="p-4"');
    expect(out.match(/__kbachStyles/g)?.length).toBe(1);
  });

  it('a single class attribute with no styles is left untouched', () => {
    const out = transform(`<View className="group" />;`);
    expect(out).toContain('className="group"');
    expect(out).not.toContain('__kbachClasses');
  });
});
