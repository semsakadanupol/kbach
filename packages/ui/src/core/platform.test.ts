import { describe, it, expect, afterEach, vi } from 'vitest';

// isNative/isWeb are computed once at module load time (see platform.ts), so
// exercising different global setups requires resetting the module registry
// and re-importing fresh between cases. This file's tests run in Node (no
// jsdom), so `window`/`document` are always absent — isWeb is false in every
// case here, exactly matching a real native device or SSR.

const NATIVE_GLOBAL_KEYS = [
  'HermesInternal',
  '__fbBatchedBridge',
  '__REACT_NATIVE__',
  'nativeFabricUIManager',
  '__turboModuleProxy',
  'RN$Bridgeless',
  'nativePerformanceNow',
] as const;

function clearNativeGlobals(): void {
  for (const key of NATIVE_GLOBAL_KEYS) delete (globalThis as any)[key];
  delete (globalThis as any).navigator;
}

afterEach(() => {
  clearNativeGlobals();
  vi.resetModules();
});

describe('isNative detection', () => {
  it('is false with no native or web signals present (matches Node SSR)', async () => {
    clearNativeGlobals();
    vi.resetModules();
    const { isNative, isWeb } = await import('./platform');
    expect(isWeb).toBe(false);
    expect(isNative).toBe(false);
  });

  it('is true via legacy HermesInternal + __fbBatchedBridge (old architecture)', async () => {
    clearNativeGlobals();
    (globalThis as any).HermesInternal = {};
    (globalThis as any).__fbBatchedBridge = {};
    vi.resetModules();
    const { isNative } = await import('./platform');
    expect(isNative).toBe(true);
  });

  it('is true via navigator.product === "ReactNative" alone', async () => {
    clearNativeGlobals();
    (globalThis as any).navigator = { product: 'ReactNative' };
    vi.resetModules();
    const { isNative } = await import('./platform');
    expect(isNative).toBe(true);
  });

  // Regression: New Architecture (Fabric/TurboModules/Bridgeless — Expo's
  // newArchEnabled, default since SDK 53+) removes __fbBatchedBridge entirely.
  // An app with no other legacy signal present must still be detected as
  // native via the New Architecture's own globals, or getEffectiveIsWeb()
  // wrongly substitutes HTML tag strings for View/Text and the app renders
  // blank on a real device.
  it('is true via nativeFabricUIManager alone, with no legacy bridge present (New Architecture)', async () => {
    clearNativeGlobals();
    (globalThis as any).nativeFabricUIManager = {};
    vi.resetModules();
    const { isNative } = await import('./platform');
    expect(isNative).toBe(true);
  });

  it('is true via __turboModuleProxy alone (New Architecture)', async () => {
    clearNativeGlobals();
    (globalThis as any).__turboModuleProxy = () => undefined;
    vi.resetModules();
    const { isNative } = await import('./platform');
    expect(isNative).toBe(true);
  });

  it('is true via RN$Bridgeless alone (Bridgeless mode)', async () => {
    clearNativeGlobals();
    (globalThis as any)['RN$Bridgeless'] = true;
    vi.resetModules();
    const { isNative } = await import('./platform');
    expect(isNative).toBe(true);
  });
});

describe('getEffectiveIsWeb() stays false for New Architecture native, matching isNative', () => {
  it('does not fall back to web-flavored resolution when only Fabric globals are present', async () => {
    clearNativeGlobals();
    (globalThis as any).nativeFabricUIManager = {};
    vi.resetModules();
    const { getEffectiveIsWeb } = await import('./platform');
    expect(getEffectiveIsWeb()).toBe(false);
  });
});
