import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveStyle = vi.fn((classString: string, pressed?: boolean) => ({ resolved: classString, pressed: pressed ?? false }));

vi.mock('./nativeBridge', () => ({
  resolveStyle: mockResolveStyle,
}));

// jsx-runtime.tsx imports Pressable from 'react-native' by reference (to
// compare `type === Pressable`) — mocked here as a distinct marker so tests
// can pass the same reference as `type`, same as nativeBridge.test.ts mocks
// Appearance/NativeModules for the same "don't load the real RN package in
// a plain Node/vitest environment" reason.
const MockPressable = () => null;
vi.mock('react-native', () => ({
  Pressable: MockPressable,
}));

describe('jsx-runtime (react-native)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a plain-string className into the style prop, not className', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('View', { className: 'flex items-center' }, undefined);
    expect(mockResolveStyle).toHaveBeenCalledWith('flex items-center', false);
    expect((el as any).props.style).toEqual({ resolved: 'flex items-center', pressed: false });
    expect((el as any).props.className).toBeUndefined();
  });

  it('merges an explicit inline style prop AFTER the resolved style (explicit wins on overlap)', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('View', { className: 'bg-blue-6', style: { opacity: 0.5 } }, undefined);
    expect((el as any).props.style).toEqual([{ resolved: 'bg-blue-6', pressed: false }, { opacity: 0.5 }]);
  });

  it('forwards unrelated props and children unchanged', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('Text', { className: 'text-gray-9', onPress: 'noop', children: 'hi' }, undefined);
    expect((el as any).props.onPress).toBe('noop');
    expect((el as any).props.children).toBe('hi');
  });

  it('passes through an element with no className prop at all, untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('View', { testID: 'x' }, undefined);
    expect(mockResolveStyle).not.toHaveBeenCalled();
    expect((el as any).props.style).toBeUndefined();
    expect((el as any).props.testID).toBe('x');
  });

  it('does not resolve a non-string className — forwards untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    const classNameFn = (_: unknown) => 'active';
    const el = jsx('View', { className: classNameFn }, undefined);
    expect(mockResolveStyle).not.toHaveBeenCalled();
    expect((el as any).props.className).toBe(classNameFn);
  });

  it('passes through null type and symbol type untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    expect(() => jsx(null, { className: 'flex' }, undefined)).not.toThrow();
    expect(() => jsx(Symbol('react.fragment'), { className: 'flex' }, undefined)).not.toThrow();
    expect(mockResolveStyle).not.toHaveBeenCalled();
  });

  it('resolves className via jsxs (static-children form) the same way as jsx', async () => {
    const { jsxs } = await import('./jsx-runtime');
    const el = jsxs('View', { className: 'flex-row', children: ['a', 'b'] }, undefined);
    expect(mockResolveStyle).toHaveBeenCalledWith('flex-row', false);
    expect((el as any).props.style).toEqual({ resolved: 'flex-row', pressed: false });
  });

  it('gives Pressable a style FUNCTION instead of a static value', async () => {
    const { Pressable } = await import('react-native');
    const { jsx } = await import('./jsx-runtime');
    const el = jsx(Pressable, { className: 'bg-blue-6 active:bg-blue-8' }, undefined);
    expect(typeof (el as any).props.style).toBe('function');
    // Not called yet — resolution is deferred until Pressable invokes it with real press state.
    expect(mockResolveStyle).not.toHaveBeenCalled();
  });

  it("Pressable's style function resolves with the press state it's called with", async () => {
    const { Pressable } = await import('react-native');
    const { jsx } = await import('./jsx-runtime');
    const el = jsx(Pressable, { className: 'active:bg-blue-8' }, undefined);
    const styleFn = (el as any).props.style as (state: { pressed: boolean }) => unknown;

    expect(styleFn({ pressed: false })).toEqual({ resolved: 'active:bg-blue-8', pressed: false });
    expect(mockResolveStyle).toHaveBeenLastCalledWith('active:bg-blue-8', false);

    expect(styleFn({ pressed: true })).toEqual({ resolved: 'active:bg-blue-8', pressed: true });
    expect(mockResolveStyle).toHaveBeenLastCalledWith('active:bg-blue-8', true);
  });

  it("calls a function-valued userStyle on Pressable with the press state too", async () => {
    const { Pressable } = await import('react-native');
    const { jsx } = await import('./jsx-runtime');
    const userStyleFn = vi.fn((state: { pressed: boolean }) => ({ opacity: state.pressed ? 0.5 : 1 }));
    const el = jsx(Pressable, { className: 'bg-blue-6', style: userStyleFn }, undefined);
    const styleFn = (el as any).props.style as (state: { pressed: boolean }) => unknown;

    expect(styleFn({ pressed: true })).toEqual([{ resolved: 'bg-blue-6', pressed: true }, { opacity: 0.5 }]);
    expect(userStyleFn).toHaveBeenCalledWith({ pressed: true });
  });
});
