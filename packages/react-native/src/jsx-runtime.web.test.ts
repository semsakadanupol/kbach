import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockResolveClassName = vi.fn((classString: string) => classString);

// The actual interception logic (className -> dataSet, no Pressable special
// case) is jsxRuntimeCoreWeb.ts — this file only needs to prove
// jsx-runtime.web.tsx wires that web-specific core to nativeBridge.web.ts's
// resolveClassName, not re-verify the whole behavior.
vi.mock('./nativeBridge.web', () => ({
  resolveClassName: mockResolveClassName,
}));

describe('jsx-runtime.web (react-native)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a plain-string className via nativeBridge.web and sets it on dataSet.kb', async () => {
    const { jsx } = await import('./jsx-runtime.web');
    const el = jsx('View', { className: 'flex items-center' }, undefined);
    expect(mockResolveClassName).toHaveBeenCalledWith('flex items-center');
    expect((el as any).props.dataSet).toEqual({ kb: 'flex items-center' });
    expect((el as any).props.className).toBeUndefined();
  });

  it('gives every element type (including Pressable) the same plain dataSet — no style function', async () => {
    const el = (await import('./jsx-runtime.web')).jsx('Pressable', { className: 'active:bg-blue-8' }, undefined);
    expect((el as any).props.dataSet).toEqual({ kb: 'active:bg-blue-8' });
    expect((el as any).props.style).toBeUndefined();
  });

  it('preserves an explicit dataSet prop, only adding its own "kb" key', async () => {
    const { jsx } = await import('./jsx-runtime.web');
    const el = jsx('View', { className: 'flex', dataSet: { testid: 'card' } }, undefined);
    expect((el as any).props.dataSet).toEqual({ testid: 'card', kb: 'flex' });
  });

  it('leaves a plain style prop untouched — no merging needed on web', async () => {
    const { jsx } = await import('./jsx-runtime.web');
    const el = jsx('View', { className: 'bg-blue-6', style: { opacity: 0.5 } }, undefined);
    expect((el as any).props.style).toEqual({ opacity: 0.5 });
  });
});
