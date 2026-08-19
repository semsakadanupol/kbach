import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { useDynamicToken } from './useDynamicToken';
import { setDynamicToken, _resetForTests } from './dynamicTokens';

function Probe({ name }: { name: string }): null {
  Probe.lastValue = useDynamicToken(name);
  return null;
}
Probe.lastValue = undefined as string | undefined;

describe('useDynamicToken', () => {
  beforeEach(() => {
    _resetForTests();
    Probe.lastValue = undefined;
  });

  it('returns undefined for a token that was never set', () => {
    act(() => {
      TestRenderer.create(<Probe name="sidebar-width" />);
    });
    expect(Probe.lastValue).toBeUndefined();
  });

  it('returns the current value for a registered token', () => {
    setDynamicToken('sidebar-width', '240px');
    act(() => {
      TestRenderer.create(<Probe name="sidebar-width" />);
    });
    expect(Probe.lastValue).toBe('240px');
  });

  it('re-renders with the new value when the token changes', () => {
    setDynamicToken('sidebar-width', '240px');
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Probe name="sidebar-width" />);
    });
    expect(Probe.lastValue).toBe('240px');

    act(() => {
      setDynamicToken('sidebar-width', '320px');
    });
    expect(Probe.lastValue).toBe('320px');

    act(() => {
      renderer!.unmount();
    });
  });
});
