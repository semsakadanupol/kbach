import { describe, it, expect, vi } from 'vitest';
import {
  composeNativeStyle, hasResponsiveBuckets, hasInteractiveBuckets,
  chain, stripInternalMarkers, stripWebOnlyProps,
} from './shared-utils';

describe('composeNativeStyle', () => {
  // The whole point of this function: react-native-reanimated's
  // useAnimatedStyle() returns an object the native UI thread mutates by
  // reference. Spreading/Object.assign-ing it into a new object silently
  // freezes the animation at its first frame — so the REFERENCE identity of
  // userStyle (or each element of it) must survive into the returned array.

  it('returns the computed style as-is when there is no user style', () => {
    const computed = { padding: 4 };
    expect(composeNativeStyle(computed, undefined)).toBe(computed);
    expect(composeNativeStyle(computed, null)).toBe(computed);
    expect(composeNativeStyle(computed, false)).toBe(computed);
  });

  it('composes a plain-object user style as [computed, userStyle] — never spread', () => {
    const computed = { padding: 4 };
    const userStyle = { opacity: 0.5 }; // stands in for a Reanimated animated-style object
    const result = composeNativeStyle(computed, userStyle);
    expect(result).toEqual([computed, userStyle]);
    expect(Array.isArray(result)).toBe(true);
    // Reference identity, not just deep equality — this is the actual bug this exists to prevent.
    expect((result as unknown[])[0]).toBe(computed);
    expect((result as unknown[])[1]).toBe(userStyle);
  });

  it('composes an array user style as [computed, ...userStyle], preserving each element\'s identity', () => {
    const computed = { padding: 4 };
    const animatedStyle = { opacity: 0.5 }; // e.g. from useAnimatedStyle()
    const userStyle = [animatedStyle, { margin: 8 }];
    const result = composeNativeStyle(computed, userStyle) as unknown[];
    expect(result).toEqual([computed, animatedStyle, { margin: 8 }]);
    expect(result[1]).toBe(animatedStyle);
  });
});

describe('chain', () => {
  it('calls the original handler with its arguments, then the extra handler with none', () => {
    const calls: unknown[] = [];
    const original = (a: number, b: number) => calls.push(['original', a, b]);
    const extra = () => calls.push(['extra']);
    chain(original, extra)(1, 2);
    expect(calls).toEqual([['original', 1, 2], ['extra']]);
  });

  it('still calls extra when there is no original handler', () => {
    const extra = vi.fn();
    chain(undefined, extra)();
    expect(extra).toHaveBeenCalledOnce();
  });
});

describe('stripInternalMarkers', () => {
  it('removes internal marker keys and leaves everything else', () => {
    const s: Record<string, unknown> = { padding: 4, __divideX: 1, __keyframe: 'foo' };
    stripInternalMarkers(s);
    expect(s).toEqual({ padding: 4 });
  });
});

describe('stripWebOnlyProps', () => {
  it('removes display:grid but keeps display:flex', () => {
    const grid: Record<string, unknown> = { display: 'grid' };
    stripWebOnlyProps(grid);
    expect(grid.display).toBeUndefined();

    const flex: Record<string, unknown> = { display: 'flex' };
    stripWebOnlyProps(flex);
    expect(flex.display).toBe('flex');
  });

  it('removes position:sticky/fixed/static but keeps position:relative', () => {
    const sticky: Record<string, unknown> = { position: 'sticky' };
    stripWebOnlyProps(sticky);
    expect(sticky.position).toBeUndefined();

    const relative: Record<string, unknown> = { position: 'relative' };
    stripWebOnlyProps(relative);
    expect(relative.position).toBe('relative');
  });

  it('removes grid-only layout props', () => {
    const s: Record<string, unknown> = { gridTemplateColumns: '1fr 1fr', placeItems: 'center', padding: 4 };
    stripWebOnlyProps(s);
    expect(s).toEqual({ padding: 4 });
  });
});

describe('hasResponsiveBuckets / hasInteractiveBuckets', () => {
  it('detects a responsive modifier bucket', () => {
    expect(hasResponsiveBuckets({ base: {}, 'sm:dark': {} })).toBe(true);
    expect(hasResponsiveBuckets({ base: {}, dark: {} })).toBe(false);
  });

  it('detects an interactive modifier bucket', () => {
    expect(hasInteractiveBuckets({ base: {}, hover: {} })).toBe(true);
    expect(hasInteractiveBuckets({ base: {}, dark: {} })).toBe(false);
  });

  it('ignores the base bucket itself', () => {
    expect(hasResponsiveBuckets({ base: {} })).toBe(false);
    expect(hasInteractiveBuckets({ base: {} })).toBe(false);
  });
});
