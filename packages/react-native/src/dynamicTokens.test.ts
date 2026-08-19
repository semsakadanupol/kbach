import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setDynamicToken,
  getDynamicToken,
  deleteDynamicToken,
  subscribeDynamicTokens,
  getDynamicTokensVersion,
  _resetForTests,
} from './dynamicTokens';

describe('dynamicTokens', () => {
  beforeEach(() => {
    _resetForTests();
  });

  it('returns undefined for a token that was never set', () => {
    expect(getDynamicToken('sidebar-width')).toBeUndefined();
  });

  it('stores and retrieves a token value', () => {
    setDynamicToken('sidebar-width', '240px');
    expect(getDynamicToken('sidebar-width')).toBe('240px');
  });

  it('overwrites a previously-set value', () => {
    setDynamicToken('sidebar-width', '240px');
    setDynamicToken('sidebar-width', '320px');
    expect(getDynamicToken('sidebar-width')).toBe('320px');
  });

  it('notifies subscribers on set', () => {
    const listener = vi.fn();
    subscribeDynamicTokens(listener);
    setDynamicToken('sidebar-width', '240px');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers on delete, but only when the token actually existed', () => {
    const listener = vi.fn();
    subscribeDynamicTokens(listener);
    deleteDynamicToken('never-set');
    expect(listener).not.toHaveBeenCalled();

    setDynamicToken('sidebar-width', '240px');
    listener.mockClear();
    deleteDynamicToken('sidebar-width');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getDynamicToken('sidebar-width')).toBeUndefined();
  });

  it('unsubscribe stops further notifications', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDynamicTokens(listener);
    unsubscribe();
    setDynamicToken('sidebar-width', '240px');
    expect(listener).not.toHaveBeenCalled();
  });

  it('increments the version on every set/delete, for a single useSyncExternalStore snapshot to watch', () => {
    const v0 = getDynamicTokensVersion();
    setDynamicToken('sidebar-width', '240px');
    const v1 = getDynamicTokensVersion();
    expect(v1).not.toBe(v0);
    deleteDynamicToken('sidebar-width');
    expect(getDynamicTokensVersion()).not.toBe(v1);
  });

  it('does not bump the version when deleting a token that was never set', () => {
    const v0 = getDynamicTokensVersion();
    deleteDynamicToken('never-set');
    expect(getDynamicTokensVersion()).toBe(v0);
  });

  it('no-ops the DOM write when document is undefined (real native, no jsdom)', () => {
    // This test file runs under vitest's default (Node) environment for
    // this package — no `document` global at all — so simply not throwing
    // here already proves the `typeof document === 'undefined'` guard works.
    expect(() => setDynamicToken('sidebar-width', '240px')).not.toThrow();
  });
});
