import { describe, it, expect, afterEach } from 'vitest';
import { getStandalone } from './layout';
import { setResolveTarget } from '../platform';

// Regression coverage for a fixed bug: the standalone utility map (flex,
// block, grid, hidden, …) used to be built once, lazily, on first access and
// cached forever — but its values depend on the platform (web vs native) at
// build time. A process that resolves classes for BOTH targets in one run
// (shared build tooling, or tests importing both the Vite and Babel plugins)
// calls setResolveTarget() to flip between them, and the old cache kept
// serving whichever platform was resolved first to the other target too.

describe('getStandalone() — platform-swap cache invalidation', () => {
  afterEach(() => setResolveTarget(null));

  it('rebuilds the map when the resolve target flips from web to native', () => {
    setResolveTarget('web');
    const web = getStandalone();
    expect(web.grid).toEqual({ display: 'grid' });

    setResolveTarget('native');
    const native = getStandalone();
    expect(native.grid).toBeNull();
  });

  it('rebuilds the map when the resolve target flips from native to web', () => {
    setResolveTarget('native');
    const native = getStandalone();
    expect(native.block).toBeNull();

    setResolveTarget('web');
    const web = getStandalone();
    expect(web.block).toEqual({ display: 'block' });
  });

  it('returns the cached object (no rebuild) on repeated calls for the same target', () => {
    setResolveTarget('web');
    const first = getStandalone();
    const second = getStandalone();
    expect(second).toBe(first);
  });
});
