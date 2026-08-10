import { describe, it, expect, afterEach } from 'vitest';
import { effectResolvers } from './effects';
import { setResolveTarget } from '../platform';
import { buildConfig } from '../config';
import type { ParsedClass } from '../types';

// Regression coverage for a fixed bug: theme.shadow's presets only ever
// carried React Native's shadowColor/shadowOffset/shadowOpacity/shadowRadius/
// elevation properties — styleValueToCSS's RN_ONLY_PROPS filter (and the
// "typeof val === 'object'" check, since shadowOffset is an object) strips
// every one of them, so `shadow`/`shadow-sm`/`shadow-md`/… produced ZERO CSS
// on web; the classes were a complete no-op. Fixed by giving each preset a
// `boxShadow` string too (Tailwind's own default shadow scale) and having the
// `shadow` resolver pick boxShadow on web / the native properties on native,
// instead of leaving it to the generic style-to-CSS filter to sort out.

const theme = buildConfig({}).theme;

function parsed(overrides: Partial<ParsedClass>): ParsedClass {
  return {
    original: '', modifiers: [], negative: false, important: false,
    utility: '', value: '', isArbitrary: false, ...overrides,
  };
}

describe('shadow resolver — web produces real box-shadow CSS, native keeps RN shadow props', () => {
  afterEach(() => setResolveTarget(null));

  it('resolves shadow-md to a boxShadow string on web (Tailwind\'s own default value)', () => {
    setResolveTarget('web');
    const result = effectResolvers.shadow!(parsed({ value: 'md' }), theme);
    expect(result).toEqual({ boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' });
  });

  it('resolves bare "shadow" (no suffix) to the DEFAULT preset on web', () => {
    setResolveTarget('web');
    const result = effectResolvers.shadow!(parsed({ value: '' }), theme);
    expect(result).toEqual({ boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)' });
  });

  it('resolves shadow-md to native shadow*/elevation properties on native, with no boxShadow leaking in', () => {
    setResolveTarget('native');
    const result = effectResolvers.shadow!(parsed({ value: 'md' }), theme);
    expect(result).toEqual({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 3,
    });
    expect(result).not.toHaveProperty('boxShadow');
  });

  it('shadow-inner is web-only — a real inset box-shadow on web, null on native (RN has no inset shadow)', () => {
    setResolveTarget('web');
    expect(effectResolvers.shadow!(parsed({ value: 'inner' }), theme)).toEqual({
      boxShadow: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
    });

    setResolveTarget('native');
    expect(effectResolvers.shadow!(parsed({ value: 'inner' }), theme)).toBeNull();
  });

  it('returns null for an unknown shadow key on both platforms', () => {
    setResolveTarget('web');
    expect(effectResolvers.shadow!(parsed({ value: 'not-a-real-size' }), theme)).toBeNull();
    setResolveTarget('native');
    expect(effectResolvers.shadow!(parsed({ value: 'not-a-real-size' }), theme)).toBeNull();
  });
});
