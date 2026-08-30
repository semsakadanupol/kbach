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

  it('resolves a plain-string className via nativeBridge.web, sets it on dataSet.kb, and puts className back on props too (for custom components)', async () => {
    const { jsx } = await import('./jsx-runtime.web');
    const el = jsx('View', { className: 'flex items-center' }, undefined);
    expect(mockResolveClassName).toHaveBeenCalledWith('flex items-center');
    expect((el as any).props.dataSet).toEqual({ kb: 'flex items-center' });
    // A real host primitive only ever reads dataSet.kb and ignores this
    // extra prop; a custom component needs it to actually receive
    // `className` at all — see jsxRuntimeCoreWeb.ts's own doc comment.
    expect((el as any).props.className).toBe('flex items-center');
  });

  it('gives every element type (including Pressable) the same plain dataSet — no style function', async () => {
    const el = (await import('./jsx-runtime.web')).jsx('Pressable', { className: 'active:bg-blue-8' }, undefined);
    expect((el as any).props.dataSet).toEqual({ kb: 'active:bg-blue-8' });
    expect((el as any).props.style).toBeUndefined();
  });

  it('gives a custom component (not a host primitive) a real className prop, not just dataSet', async () => {
    const CustomWrapper = (_props: { className?: string }) => null;
    const { jsx } = await import('./jsx-runtime.web');
    const el = jsx(CustomWrapper, { className: 'flex-1 items-center' }, undefined);
    expect((el as any).props.className).toBe('flex-1 items-center');
    expect((el as any).props.dataSet).toEqual({ kb: 'flex-1 items-center' });
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
