// @vitest-environment jsdom
// Regression guard mirroring darkModeStore.web.test.ts's own reasoning:
// dynamicTokens.ts is shared by real native AND Expo Web (no `.web.ts`
// sibling), and only Expo Web renders into a real DOM where writing the
// actual CSS custom property matters — native's own reactivity goes
// through this store's subscribers instead (see jsxRuntimeCore.ts).
import { describe, it, expect, beforeEach } from 'vitest';
import { setDynamicToken, deleteDynamicToken, _resetForTests } from './dynamicTokens';

describe('dynamicTokens (jsdom)', () => {
  beforeEach(() => {
    _resetForTests();
    document.documentElement.style.cssText = '';
  });

  it('writes the real CSS custom property to the document root', () => {
    setDynamicToken('sidebar-width', '240px');
    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('240px');
  });

  it('updates the CSS custom property when the token is overwritten', () => {
    setDynamicToken('sidebar-width', '240px');
    setDynamicToken('sidebar-width', '320px');
    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('320px');
  });

  it('removes the CSS custom property when the token is deleted', () => {
    setDynamicToken('sidebar-width', '240px');
    deleteDynamicToken('sidebar-width');
    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('');
  });
});
