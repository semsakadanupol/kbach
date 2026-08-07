import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('@kbach/native compat shim', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.resetModules();
  });

  it('re-exports the @kbach/react surface plus the native-specific helpers', async () => {
    process.env.NODE_ENV = 'test';
    const native = await import('./index');
    const react = await import('@kbach/react');

    // Everything @kbach/react exports should be reachable through the shim.
    // ('default' is a synthetic CJS-interop key from dynamic import(), not a
    // real named export.)
    for (const key of Object.keys(react)) {
      if (key === 'default') continue;
      expect(native).toHaveProperty(key);
    }

    // Native-only additions.
    expect(native.ThemeProvider).toBeTypeOf('function');
    expect(native.withKbach).toBeTypeOf('function');
    expect(native.withKbachBabel).toBeTypeOf('function');
    expect(native.createKbachConfig).toBeTypeOf('function');

    // The shadowed ThemeProvider must be the native-aware one, not the plain
    // web ThemeProvider re-exported via `export * from '@kbach/react'`.
    expect(native.ThemeProvider).not.toBe(react.ThemeProvider);
  });

  it('warns once in dev that the package is deprecated', async () => {
    process.env.NODE_ENV = 'development';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    await import('./index');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('deprecated');
    warnSpy.mockRestore();
  });

  it('does not warn in production', async () => {
    process.env.NODE_ENV = 'production';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.resetModules();
    await import('./index');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
