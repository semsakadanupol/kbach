import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJsx = vi.fn((_type: unknown, _props: unknown, _key: unknown) => ({ type: 'View', props: {} }));
const mockJsxs = vi.fn((_type: unknown, _props: unknown, _key: unknown) => ({ type: 'View', props: {} }));

vi.mock('./jsx-runtime.web', () => ({
  jsx: mockJsx,
  jsxs: mockJsxs,
  Fragment: Symbol('react.fragment'),
}));

// jsx-dev-runtime.web.tsx also imports jsxRuntimeCore.ts directly (for
// createJsxDEV), which imports Pressable from 'react-native' — same
// "don't load the real RN package in a plain Node/vitest environment"
// reason jsx-dev-runtime.test.ts's identical mock exists for.
vi.mock('react-native', () => ({
  Pressable: () => null,
}));

describe('jsx-dev-runtime.web (react-native)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to jsx() when isStaticChildren is false', async () => {
    const { jsxDEV } = await import('./jsx-dev-runtime.web');
    jsxDEV('View', { className: 'flex' }, undefined, false);
    expect(mockJsx).toHaveBeenCalledWith('View', { className: 'flex' }, undefined);
    expect(mockJsxs).not.toHaveBeenCalled();
  });

  it('delegates to jsxs() when isStaticChildren is true', async () => {
    const { jsxDEV } = await import('./jsx-dev-runtime.web');
    jsxDEV('View', { className: 'flex-row' }, undefined, true);
    expect(mockJsxs).toHaveBeenCalled();
    expect(mockJsx).not.toHaveBeenCalled();
  });

  it('patches _source/_self onto an extensible returned element', async () => {
    const { jsxDEV } = await import('./jsx-dev-runtime.web');
    const source = { fileName: 'App.tsx', lineNumber: 10, columnNumber: 3 };
    const el = jsxDEV('View', {}, undefined, false, source, 'self-value');
    expect((el as any)._source).toBe(source);
    expect((el as any)._self).toBe('self-value');
  });
});
