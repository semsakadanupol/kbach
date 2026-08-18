import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJsx = vi.fn((_type: unknown, _props: unknown, _key: unknown) => ({ type: 'View', props: {} }));
const mockJsxs = vi.fn((_type: unknown, _props: unknown, _key: unknown) => ({ type: 'View', props: {} }));

vi.mock('./jsx-runtime', () => ({
  jsx: mockJsx,
  jsxs: mockJsxs,
  Fragment: Symbol('react.fragment'),
}));

// jsx-dev-runtime.tsx also imports jsxRuntimeCore.ts (for createJsxDEV),
// which imports Pressable from 'react-native' — same "don't load the real
// RN package in a plain Node/vitest environment" reason jsx-runtime.test.ts's
// identical mock exists for. Appearance is also needed — jsxRuntimeCore.ts
// imports darkModeStore.ts (see jsx-runtime.test.ts's own comment on this).
vi.mock('react-native', () => ({
  Pressable: () => null,
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: () => ({ remove: vi.fn() }),
  },
}));

describe('jsx-dev-runtime (react-native)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to jsx() when isStaticChildren is false', async () => {
    const { jsxDEV } = await import('./jsx-dev-runtime');
    jsxDEV('View', { className: 'flex' }, undefined, false);
    expect(mockJsx).toHaveBeenCalledWith('View', { className: 'flex' }, undefined);
    expect(mockJsxs).not.toHaveBeenCalled();
  });

  it('delegates to jsxs() when isStaticChildren is true', async () => {
    const { jsxDEV } = await import('./jsx-dev-runtime');
    jsxDEV('View', { className: 'flex-row' }, undefined, true);
    expect(mockJsxs).toHaveBeenCalled();
    expect(mockJsx).not.toHaveBeenCalled();
  });

  it('patches _source/_self onto an extensible returned element', async () => {
    const { jsxDEV } = await import('./jsx-dev-runtime');
    const source = { fileName: 'App.tsx', lineNumber: 10, columnNumber: 3 };
    const el = jsxDEV('View', {}, undefined, false, source, 'self-value');
    expect((el as any)._source).toBe(source);
    expect((el as any)._self).toBe('self-value');
  });

  it('does not throw when the returned element is frozen (React 19 behavior)', async () => {
    mockJsx.mockReturnValueOnce(Object.freeze({ type: 'View', props: {} }));
    const { jsxDEV } = await import('./jsx-dev-runtime');
    const source = { fileName: 'App.tsx', lineNumber: 1, columnNumber: 1 };
    expect(() => jsxDEV('View', {}, undefined, false, source)).not.toThrow();
  });
});
