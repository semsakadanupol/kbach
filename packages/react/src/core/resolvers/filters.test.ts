import { describe, it, expect } from 'vitest';
import { filterResolvers, FILTER_COMPOSE, BACKDROP_FILTER_COMPOSE } from './filters';
import { buildConfig } from '../config';
import type { ParsedClass } from '../types';

// Regression coverage for a fixed bug: grayscale/invert/sepia (and their
// backdrop-* counterparts) used to ignore isArbitrary entirely and always
// snap to 0%/100%, so `grayscale-[50%]` silently resolved to grayscale(100%)
// instead of the requested 50% — unlike every sibling filter (blur,
// brightness, contrast, saturate, hue-rotate) in the same file, which did
// already honor arbitrary values.

const theme = buildConfig({}).theme;

function parsed(overrides: Partial<ParsedClass>): ParsedClass {
  return {
    original: '', modifiers: [], negative: false, important: false,
    utility: '', value: '', isArbitrary: false, ...overrides,
  };
}

describe.each([
  ['grayscale', '--kb-grayscale', FILTER_COMPOSE, 'filter'] as const,
  ['invert', '--kb-invert', FILTER_COMPOSE, 'filter'] as const,
  ['sepia', '--kb-sepia', FILTER_COMPOSE, 'filter'] as const,
  ['backdrop-grayscale', '--kb-backdrop-grayscale', BACKDROP_FILTER_COMPOSE, 'backdropFilter'] as const,
  ['backdrop-invert', '--kb-backdrop-invert', BACKDROP_FILTER_COMPOSE, 'backdropFilter'] as const,
  ['backdrop-sepia', '--kb-backdrop-sepia', BACKDROP_FILTER_COMPOSE, 'backdropFilter'] as const,
])('%s', (utility, cssVar, compose, filterProp) => {
  const fnName = utility.replace('backdrop-', '') as 'grayscale' | 'invert' | 'sepia';

  it('honors an arbitrary value instead of forcing 0%/100%', () => {
    const result = filterResolvers[utility](parsed({ value: '50%', isArbitrary: true }), theme);
    expect(result).toEqual({ [cssVar]: `${fnName}(50%)`, [filterProp]: compose });
  });

  it('still treats "0" as off when not arbitrary (unchanged boolean behavior)', () => {
    const result = filterResolvers[utility](parsed({ value: '0', isArbitrary: false }), theme);
    expect(result).toEqual({ [cssVar]: `${fnName}(0)`, [filterProp]: compose });
  });

  it('still treats a bare toggle as 100% when not arbitrary (unchanged boolean behavior)', () => {
    const result = filterResolvers[utility](parsed({ value: '', isArbitrary: false }), theme);
    expect(result).toEqual({ [cssVar]: `${fnName}(100%)`, [filterProp]: compose });
  });
});

describe('blur', () => {
  it('resolves a named preset', () => {
    expect(filterResolvers.blur(parsed({ value: 'lg' }), theme)).toEqual({ '--kb-blur': 'blur(16px)', filter: FILTER_COMPOSE });
  });

  it('resolves the bare (no-value) preset', () => {
    expect(filterResolvers.blur(parsed({ value: '' }), theme)).toEqual({ '--kb-blur': 'blur(8px)', filter: FILTER_COMPOSE });
  });

  it('resolves "none" to an empty var (clears the blur)', () => {
    expect(filterResolvers.blur(parsed({ value: 'none' }), theme)).toEqual({ '--kb-blur': '', filter: FILTER_COMPOSE });
  });

  it('resolves an arbitrary value', () => {
    expect(filterResolvers.blur(parsed({ value: '10px', isArbitrary: true }), theme)).toEqual({ '--kb-blur': 'blur(10px)', filter: FILTER_COMPOSE });
  });

  it('returns null for an unrecognized preset name', () => {
    expect(filterResolvers.blur(parsed({ value: 'huge' }), theme)).toBeNull();
  });
});

describe.each([
  ['brightness', '--kb-brightness'] as const,
  ['contrast', '--kb-contrast'] as const,
  ['saturate', '--kb-saturate'] as const,
])('%s', (utility, cssVar) => {
  it('converts a percentage-scale value to a decimal multiplier', () => {
    expect(filterResolvers[utility](parsed({ value: '150' }), theme)).toEqual({ [cssVar]: `${utility}(1.5)`, filter: FILTER_COMPOSE });
  });

  it('passes an arbitrary value through verbatim', () => {
    expect(filterResolvers[utility](parsed({ value: '1.75', isArbitrary: true }), theme)).toEqual({ [cssVar]: `${utility}(1.75)`, filter: FILTER_COMPOSE });
  });

  it('returns null for a non-numeric non-arbitrary value', () => {
    expect(filterResolvers[utility](parsed({ value: 'nope' }), theme)).toBeNull();
  });
});

describe('hue-rotate', () => {
  it('applies degrees with sign from the negative flag', () => {
    expect(filterResolvers['hue-rotate'](parsed({ value: '90' }), theme)).toEqual({ '--kb-hue-rotate': 'hue-rotate(90deg)', filter: FILTER_COMPOSE });
    expect(filterResolvers['hue-rotate'](parsed({ value: '90', negative: true }), theme)).toEqual({ '--kb-hue-rotate': 'hue-rotate(-90deg)', filter: FILTER_COMPOSE });
  });

  it('passes an arbitrary value through verbatim', () => {
    expect(filterResolvers['hue-rotate'](parsed({ value: '45deg', isArbitrary: true }), theme)).toEqual({ '--kb-hue-rotate': 'hue-rotate(45deg)', filter: FILTER_COMPOSE });
  });

  it('returns null for a non-numeric non-arbitrary value', () => {
    expect(filterResolvers['hue-rotate'](parsed({ value: 'nope' }), theme)).toBeNull();
  });
});

describe('drop-shadow', () => {
  it('resolves a named preset', () => {
    const result = filterResolvers['drop-shadow'](parsed({ value: 'md' }), theme);
    expect(result).toEqual({ '--kb-drop-shadow': expect.stringContaining('drop-shadow'), filter: FILTER_COMPOSE });
  });

  it('resolves "none" to a zero shadow', () => {
    expect(filterResolvers['drop-shadow'](parsed({ value: 'none' }), theme)).toEqual({ '--kb-drop-shadow': 'drop-shadow(0 0 #0000)', filter: FILTER_COMPOSE });
  });

  it('resolves an arbitrary value, converting underscores to spaces', () => {
    expect(filterResolvers['drop-shadow'](parsed({ value: '0_4px_3px_red', isArbitrary: true }), theme))
      .toEqual({ '--kb-drop-shadow': 'drop-shadow(0 4px 3px red)', filter: FILTER_COMPOSE });
  });

  it('returns null for an unrecognized preset name', () => {
    expect(filterResolvers['drop-shadow'](parsed({ value: 'huge' }), theme)).toBeNull();
  });
});

describe('filter (raw arbitrary filter string)', () => {
  it('passes an arbitrary value through, converting underscores to spaces', () => {
    expect(filterResolvers.filter(parsed({ value: 'blur(4px)_grayscale(1)', isArbitrary: true }), theme))
      .toEqual({ filter: 'blur(4px) grayscale(1)' });
  });

  it('resolves "none"', () => {
    expect(filterResolvers.filter(parsed({ value: 'none' }), theme)).toEqual({ filter: 'none' });
  });

  it('returns null for any other non-arbitrary value (only "none" is a valid preset)', () => {
    expect(filterResolvers.filter(parsed({ value: 'huge' }), theme)).toBeNull();
  });
});

describe('backdrop-opacity', () => {
  it('converts a percentage-scale value to a decimal multiplier', () => {
    expect(filterResolvers['backdrop-opacity'](parsed({ value: '50' }), theme)).toEqual({ '--kb-backdrop-opacity': 'opacity(0.5)', backdropFilter: BACKDROP_FILTER_COMPOSE });
  });

  it('passes an arbitrary value through verbatim', () => {
    expect(filterResolvers['backdrop-opacity'](parsed({ value: '0.35', isArbitrary: true }), theme)).toEqual({ '--kb-backdrop-opacity': 'opacity(0.35)', backdropFilter: BACKDROP_FILTER_COMPOSE });
  });

  it('returns null for a non-numeric non-arbitrary value', () => {
    expect(filterResolvers['backdrop-opacity'](parsed({ value: 'nope' }), theme)).toBeNull();
  });
});

describe('mix-blend / bg-blend', () => {
  it('mix-blend accepts a known blend mode', () => {
    expect(filterResolvers['mix-blend'](parsed({ value: 'multiply' }), theme)).toEqual({ mixBlendMode: 'multiply' });
  });

  it('mix-blend uniquely accepts "plus-lighter"', () => {
    expect(filterResolvers['mix-blend'](parsed({ value: 'plus-lighter' }), theme)).toEqual({ mixBlendMode: 'plus-lighter' });
  });

  it('bg-blend does NOT accept "plus-lighter" (mix-blend-only mode)', () => {
    expect(filterResolvers['bg-blend'](parsed({ value: 'plus-lighter' }), theme)).toBeNull();
  });

  it('bg-blend accepts a known blend mode', () => {
    expect(filterResolvers['bg-blend'](parsed({ value: 'screen' }), theme)).toEqual({ backgroundBlendMode: 'screen' });
  });

  it('returns null for an unrecognized mode', () => {
    expect(filterResolvers['mix-blend'](parsed({ value: 'not-a-mode' }), theme)).toBeNull();
    expect(filterResolvers['bg-blend'](parsed({ value: 'not-a-mode' }), theme)).toBeNull();
  });
});

describe('will-change', () => {
  it('resolves a named preset', () => {
    expect(filterResolvers['will-change'](parsed({ value: 'transform' }), theme)).toEqual({ willChange: 'transform' });
  });

  it('maps "scroll" to "scroll-position"', () => {
    expect(filterResolvers['will-change'](parsed({ value: 'scroll' }), theme)).toEqual({ willChange: 'scroll-position' });
  });

  it('resolves an arbitrary comma-separated value, converting underscores to ", "', () => {
    expect(filterResolvers['will-change'](parsed({ value: 'transform_opacity', isArbitrary: true }), theme))
      .toEqual({ willChange: 'transform, opacity' });
  });

  it('returns null for an unrecognized preset name', () => {
    expect(filterResolvers['will-change'](parsed({ value: 'huge' }), theme)).toBeNull();
  });
});
