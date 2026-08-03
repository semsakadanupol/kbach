import { describe, it, expect, afterEach, vi } from 'vitest';

// isWeb/isNative/getDefaultFontFamily are all module-load-time state, so each
// case resets modules and re-imports fresh under simulated native globals —
// same technique as platform.test.ts. This file specifically exercises
// jsx-runtime's "bare element" path (no className/kb/__kbachStyles at all),
// which is a SEPARATE code path from resolve()/flatten() and needs its own
// isNative=true environment to reach the branch under test.

function setNativeGlobals() {
  (globalThis as any).HermesInternal = {};
  (globalThis as any).navigator = { product: 'ReactNative' };
}
function clearNativeGlobals() {
  delete (globalThis as any).HermesInternal;
  delete (globalThis as any).navigator;
}

afterEach(() => {
  clearNativeGlobals();
  vi.resetModules();
});

// A real RN primitive is forwardRef/memo-wrapped or a class component (see
// web-substitute.ts's looksLikeRealRNPrimitive) — this shape matches what
// RN's actual Text component looks like structurally.
function fakeTextType(): object {
  return { $$typeof: Symbol.for('react.forward_ref'), displayName: 'Text' };
}

// An icon component (e.g. @expo/vector-icons' Ionicons) is a plain function
// component — NOT forwardRef/memo-wrapped — so it fails
// looksLikeRealRNPrimitive() and getWebTag() correctly returns null for it,
// regardless of what name it happens to have.
function fakeIconType(): object {
  function Icon() { return null; }
  Icon.displayName = 'Icon';
  return Icon;
}

// Regression coverage for a real bug: this bare-element path runs for EVERY
// classless JSX element, not just <Text> — including <Ionicons name="..." />,
// which never has a className. It used to inject `{ fontFamily: defaultFont }`
// unconditionally into ANY such element's style, overwriting an icon
// component's own required fontFamily (e.g. 'Ionicons') with the app's
// default sans font — every icon in the app rendered the wrong glyph (or
// crashed native text layout under Fabric), confirmed on a real device.
// getWebTag() (already used elsewhere to name-match RN primitives for web
// substitution) is reused here, independent of its usual platform gate,
// purely to confirm `type` really is Text before touching its style.
describe('jsx-runtime — bare-element default font only touches real Text, never other bare components', () => {
  it('injects the default font onto a bare, classless Text element', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { isNative } = await import('./core/platform');
    expect(isNative).toBe(true);

    // jsx-runtime must be imported BEFORE updateConfig() runs — it subscribes
    // to config-change notifications (to invalidate its cached default font)
    // only when first loaded, so a call before that subscribes is never seen.
    // buildConfig() alone doesn't notify subscribers — only updateConfig()
    // (which calls buildConfig() internally, then notifies) does.
    const { jsx } = await import('./jsx-runtime');
    const { updateConfig } = await import('./core/config');
    updateConfig({ extend: { theme: { fontFamily: { sans: 'Tsukimi, sans-serif' } } } } as any);

    const element = jsx(fakeTextType(), {}) as any;
    expect(element.props.style).toEqual({ fontFamily: 'Tsukimi' });
  });

  it('does NOT inject a fontFamily onto a bare, classless non-Text component (e.g. an icon)', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { jsx } = await import('./jsx-runtime');
    const { updateConfig } = await import('./core/config');
    updateConfig({ extend: { theme: { fontFamily: { sans: 'Tsukimi, sans-serif' } } } } as any);

    const element = jsx(fakeIconType(), { name: 'star', size: 12, color: '#000' }) as any;
    expect(element.props.style).toBeUndefined();
    expect(element.props.name).toBe('star');
  });

  it('preserves an icon\'s own explicit style prop untouched (no fontFamily merged in)', async () => {
    clearNativeGlobals();
    setNativeGlobals();
    vi.resetModules();

    const { jsx } = await import('./jsx-runtime');
    const { updateConfig } = await import('./core/config');
    updateConfig({ extend: { theme: { fontFamily: { sans: 'Tsukimi, sans-serif' } } } } as any);

    const element = jsx(fakeIconType(), { style: { marginTop: 4 } }) as any;
    expect(element.props.style).toEqual({ marginTop: 4 });
  });
});
