import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIsRuntimeCSSDisabled = vi.fn(() => false);

vi.mock('./kb', () => ({
  isRuntimeCSSDisabled: mockIsRuntimeCSSDisabled,
}));

describe('KbachReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRuntimeCSSDisabled.mockReturnValue(false);
  });

  it('renders a <style id="kbach-reset"> tag containing the base reset', async () => {
    const { KbachReset } = await import('./KbachReset');
    const el = KbachReset() as any;
    expect(el.type).toBe('style');
    expect(el.props.id).toBe('kbach-reset');
    expect(el.props.children).toContain('box-sizing: border-box');
  });

  it('renders nothing when runtime CSS is disabled', async () => {
    mockIsRuntimeCSSDisabled.mockReturnValue(true);
    const { KbachReset } = await import('./KbachReset');
    expect(KbachReset()).toBeNull();
  });
});
