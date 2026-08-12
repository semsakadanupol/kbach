import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockKb = vi.fn((classString: string) => `resolved:${classString}`);

vi.mock('./kb', () => ({
  kb: mockKb,
}));

describe('jsx-runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a plain-string className through kb()', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('div', { className: 'bg-blue-6 p-4' }, undefined);
    expect(mockKb).toHaveBeenCalledWith('bg-blue-6 p-4');
    expect((el as any).props.className).toBe('resolved:bg-blue-6 p-4');
  });

  it('forwards unrelated props and children unchanged', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('button', { className: 'bg-blue-6', onClick: 'noop', children: 'Click me' }, undefined);
    expect((el as any).props.onClick).toBe('noop');
    expect((el as any).props.children).toBe('Click me');
  });

  it('passes through an element with no className prop at all, untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    const el = jsx('div', { id: 'x' }, undefined);
    expect(mockKb).not.toHaveBeenCalled();
    expect((el as any).props.className).toBeUndefined();
    expect((el as any).props.id).toBe('x');
  });

  it('does not resolve a non-string className (e.g. a function, react-router style) — forwards untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    const classNameFn = (_: unknown) => 'active';
    const el = jsx('a', { className: classNameFn }, undefined);
    expect(mockKb).not.toHaveBeenCalled();
    expect((el as any).props.className).toBe(classNameFn);
  });

  it('passes through null type (Fragment/Portal-like) untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    expect(() => jsx(null, { className: 'bg-blue-6' }, undefined)).not.toThrow();
    expect(mockKb).not.toHaveBeenCalled();
  });

  it('passes through a symbol type untouched', async () => {
    const { jsx } = await import('./jsx-runtime');
    const sym = Symbol('react.fragment');
    expect(() => jsx(sym, { className: 'bg-blue-6' }, undefined)).not.toThrow();
    expect(mockKb).not.toHaveBeenCalled();
  });

  it('resolves className via jsxs (static-children form) the same way as jsx', async () => {
    const { jsxs } = await import('./jsx-runtime');
    const el = jsxs('div', { className: 'flex gap-4', children: ['a', 'b'] }, undefined);
    expect(mockKb).toHaveBeenCalledWith('flex gap-4');
    expect((el as any).props.className).toBe('resolved:flex gap-4');
  });
});
