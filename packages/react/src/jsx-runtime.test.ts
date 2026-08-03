import { describe, it, expect } from 'vitest';
import { jsx } from './jsx-runtime';
import { DarkWrapper } from './DarkWrapper';
import { InteractiveWrapper } from './InteractiveWrapper';

// Regression coverage for a fixed SSR/hydration bug: __kbachStyles (the
// Babel plugin's build-time-resolved, NATIVE-flavored style object) used to
// be trusted whenever raw `isWeb` was false — which is true BOTH on a real
// native device AND during Node.js SSR of a React Native Web app (no
// `window` in Node either). Trusting it during SSR meant resolve() (and its
// bucket-key computation, which decides interactive/responsive wrapper
// routing) never ran server-side — so an element could route to a
// different wrapper component server- vs client-side for the exact same
// classString, a real React hydration mismatch, and specifically surfaces as
// wrong/flashing responsive spacing on SSR'd React Native Web.
//
// This test file intentionally has NO `@vitest-environment jsdom` pragma —
// plain Node gives isWeb=false, isNative=false, exactly matching SSR.

describe('jsx-runtime — SSR (isWeb=false, isNative=false) does not trust a stale __kbachStyles object', () => {
  it('re-resolves a responsive class fresh via resolve(), ignoring a wrong/empty __kbachStyles', () => {
    const element = jsx('div', {
      className: 'sm:p-4',
      // Stands in for a build-time, native-resolved object that (for
      // whatever reason) has no "sm" bucket — if the bug were present, this
      // stale object would be trusted outright instead of re-resolving.
      __kbachStyles: {},
    }) as any;
    // "sm:p-4" is a real responsive utility — a correct resolve() call finds
    // an "sm" bucket and routes through DarkWrapper. Trusting the fake empty
    // __kbachStyles as-is would route through the plain (unwrapped) path instead.
    expect(element.type).toBe(DarkWrapper);
  });

  it('re-resolves an interactive class fresh via resolve(), ignoring a wrong/empty __kbachStyles', () => {
    const element = jsx('div', { className: 'hover:p-4', __kbachStyles: {} }) as any;
    expect(element.type).toBe(InteractiveWrapper);
  });

  it('a plain (no interactive/responsive modifier) class is unaffected either way', () => {
    const element = jsx('div', { className: 'p-4', __kbachStyles: {} }) as any;
    expect(element.type).toBe('div');
  });
});

// Regression coverage for converting the "implied RN layout" compensation
// (position:relative, display:flex/flexDirection:column for a substituted RN
// primitive — see web-substitute.ts's getImpliedRNClasses) from an
// automatically-injected INLINE STYLE to real utility CLASSES folded into
// className. Before: a substituted <View className="flex-1"> rendered BOTH
// className="flex-1" AND an automatic style={{position:'relative',
// display:'flex', flexDirection:'column'}} — inline styling the framework
// itself injected, not the user. After: purely className="flex-1 relative
// flex-col", zero inline style unless the user provides their own `style` prop.
function fakeViewType(): object {
  return { $$typeof: Symbol.for('react.forward_ref'), displayName: 'View' };
}

describe('jsx-runtime — implied RN layout compensation is a className, not an inline style', () => {
  it('folds "relative flex-col" into className for a substituted View needing both, with no style prop at all', () => {
    const element = jsx(fakeViewType(), { className: 'flex-1' }) as any;
    expect(element.props.className).toBe('flex-1 relative flex-col');
    expect(element.props.style).toBeUndefined();
  });

  it('adds no compensation classes when the element already covers position/flex explicitly', () => {
    const element = jsx(fakeViewType(), { className: 'absolute' }) as any;
    expect(element.props.className).toBe('absolute');
    expect(element.props.style).toBeUndefined();
  });

  it('keeps the compensation classes separate from an explicit user style prop (no merging)', () => {
    const element = jsx(fakeViewType(), { className: 'flex-1', style: { opacity: 0.5 } }) as any;
    expect(element.props.className).toBe('flex-1 relative flex-col');
    expect(element.props.style).toEqual({ opacity: 0.5 });
  });

  it('does not add compensation classes for a plain (non-substituted) HTML element', () => {
    const element = jsx('div', { className: 'flex-1' }) as any;
    expect(element.props.className).toBe('flex-1');
  });
});
