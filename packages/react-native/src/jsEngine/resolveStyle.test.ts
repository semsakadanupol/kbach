import { describe, it, expect } from 'vitest';
import { resolveStyleJs, resolveStyleJsWithWarnings } from './resolveStyle';
import type { ThemeConfig } from '../theme';

/**
 * Mirrors `resolve_style.rs`'s and `resolvers/mod.rs`'s own Rust test
 * suites (`native_dispatcher_tests`) as closely as possible, same inputs
 * and expected outputs — this is the parity guard against the two engines
 * silently drifting apart. When you change resolve_style.rs/mod.rs's
 * native-relevant logic, mirror the change here too.
 */

const W = 400;

function theme(overrides: Partial<ThemeConfig> = {}): ThemeConfig {
  return {
    colors: { 'blue-6': '#2563eb', 'blue-8': '#1e40af', ...overrides.colors },
    spacing: { ...overrides.spacing },
    screens: { ...overrides.screens },
    darkMode: 'attribute',
    ...overrides,
  };
}

describe('resolveStyleJs', () => {
  it('resolves layout and color utilities to a flat camelCase style object', () => {
    const style = resolveStyleJs('flex items-center bg-blue-6', theme(), 'light', false, W);
    expect(style.display).toBe('flex');
    expect(style.alignItems).toBe('center');
    expect(style.backgroundColor).toBe('#2563eb');
  });

  it('converts multi-word kebab properties to camelCase', () => {
    const style = resolveStyleJs('flex-row', theme(), 'light', false, W);
    expect(style.flexDirection).toBe('row');
  });

  it('resolves font weight, text transform, and decoration as strings', () => {
    const style = resolveStyleJs('font-bold uppercase underline', theme(), 'light', false, W);
    expect(style.fontWeight).toBe('700');
    expect(style.textTransform).toBe('uppercase');
    expect(style.textDecorationLine).toBe('underline');
  });

  it('skips unknown modifier chains regardless of state', () => {
    const style = resolveStyleJs('hover:flex dark:hover:flex', theme(), 'dark', true, W);
    expect(style).toEqual({});
  });

  it('combines dark and active modifiers, requiring both to hold', () => {
    const resolves = (scheme: string, pressed: boolean) => resolveStyleJs('dark:active:flex', theme(), scheme, pressed, W);
    expect(resolves('light', false)).toEqual({});
    expect(resolves('dark', false)).toEqual({});
    expect(resolves('light', true)).toEqual({});
    expect(resolves('dark', true).display).toBe('flex');
  });

  it('applies the dark modifier only when scheme is dark', () => {
    const t = theme();
    expect(resolveStyleJs('dark:bg-blue-8', t, 'light', false, W)).toEqual({});
    expect(resolveStyleJs('dark:bg-blue-8', t, 'dark', false, W).backgroundColor).toBe('#1e40af');
  });

  it('applies the active modifier only when pressed', () => {
    const t = theme();
    expect(resolveStyleJs('active:bg-blue-8', t, 'light', false, W)).toEqual({});
    expect(resolveStyleJs('active:bg-blue-8', t, 'light', true, W).backgroundColor).toBe('#1e40af');
  });

  it('falls back to the spacing formula (n * 4) for quarter-steps missing from the theme table', () => {
    // Empty spacing table — proves this resolves purely via the formula,
    // mirroring resolvers/mod.rs's spacing_px fallback (see its own doc
    // comment for why real Tailwind v4's scale is a live formula, not a
    // fixed list).
    const t = theme();
    expect(resolveStyleJs('p-0.25', t, 'light', false, W).padding).toBe(1);
    expect(resolveStyleJs('p-1.75', t, 'light', false, W).padding).toBe(7);
    expect(resolveStyleJs('m-2.25', t, 'light', false, W).margin).toBe(9);
  });

  it('applies a responsive modifier only once the width reaches its breakpoint', () => {
    const t = theme({ screens: { sm: 640 } });
    expect(resolveStyleJs('bg-blue-6 sm:bg-blue-8', t, 'light', false, 400).backgroundColor).toBe('#2563eb');
    // Real Tailwind's min-width semantics: AT the breakpoint counts as reached.
    expect(resolveStyleJs('bg-blue-6 sm:bg-blue-8', t, 'light', false, 640).backgroundColor).toBe('#1e40af');
    expect(resolveStyleJs('bg-blue-6 sm:bg-blue-8', t, 'light', false, 800).backgroundColor).toBe('#1e40af');
  });

  it('never resolves a screen name with no matching theme entry', () => {
    expect(resolveStyleJs('sm:flex', theme(), 'light', false, 10_000)).toEqual({});
  });

  it('combines dark and responsive modifiers, requiring both to hold', () => {
    const t = theme({ screens: { md: 768 } });
    const resolves = (scheme: string, width: number) => resolveStyleJs('dark:md:bg-blue-8', t, scheme, false, width);
    expect(resolves('light', 900)).toEqual({});
    expect(resolves('dark', 500)).toEqual({});
    expect(resolves('dark', 900).backgroundColor).toBe('#1e40af');
  });

  it('a later dark variant overrides a preceding base declaration on the same property', () => {
    const t = theme();
    expect(resolveStyleJs('bg-blue-6 dark:bg-blue-8', t, 'dark', false, W).backgroundColor).toBe('#1e40af');
    expect(resolveStyleJs('bg-blue-6 dark:bg-blue-8', t, 'light', false, W).backgroundColor).toBe('#2563eb');
  });

  it('resolves spacing, radius, and font size as numbers, not strings', () => {
    const t = theme({ spacing: { '4': 16 } });
    const style = resolveStyleJs('p-4 rounded-lg text-lg', t, 'light', false, W);
    expect(style.padding).toBe(16);
    expect(style.borderRadius).toBe(8);
    expect(style.fontSize).toBe(18);
  });

  it('passes an arbitrary percentage width through as a string', () => {
    expect(resolveStyleJs('w-[50%]', theme(), 'light', false, W).width).toBe('50%');
  });

  it('resolves z-index as a number', () => {
    expect(resolveStyleJs('z-50', theme(), 'light', false, W).zIndex).toBe(50);
  });

  it('resolves the flex family as numbers with the platform-correct flex shorthand', () => {
    const style = resolveStyleJs('flex-1 flex-auto grow shrink-0 order-3', theme(), 'light', false, W);
    expect(style.flexGrow).toBe(1);
    expect(style.flexShrink).toBe(0);
    expect(style.order).toBe(3);
    // flex-1 then flex-auto both target "flex" — last write wins, and
    // flex-auto resolves to its native numeric fallback (1), not "auto".
    expect(style.flex).toBe(1);
  });

  it('does not resolve named leading/tracking keywords or truncate', () => {
    expect(resolveStyleJs('leading-tight tracking-wide truncate', theme(), 'light', false, W)).toEqual({});
  });

  it('resolves numeric line-height and arbitrary letter-spacing as numbers', () => {
    const style = resolveStyleJs('leading-6 tracking-[0.5px]', theme(), 'light', false, W);
    expect(style.lineHeight).toBe(24);
    expect(style.letterSpacing).toBe(0.5);
  });

  it('resolves an arbitrary color value', () => {
    expect(resolveStyleJs('bg-[#16a34a]', theme(), 'light', false, W).backgroundColor).toBe('#16a34a');
  });

  // Previously unresolvable entirely (an empty style object) — "blue-6/50"
  // isn't a real theme.colors key, and nativeHexColor had no opacity-suffix
  // handling of its own at all. Now delegates to colorValue, the same
  // helper the Rust web dispatcher's color_value provides, so this bakes
  // to a literal rgba() string — the only representation RN's style system
  // can use, since it can't parse a CSS var().
  it('resolves an inline "/N" slash-opacity suffix to a baked rgba', () => {
    expect(resolveStyleJs('bg-blue-6/50', theme(), 'light', false, W).backgroundColor).toBe('rgba(37,99,235,0.5)');
    expect(resolveStyleJs('text-blue-6/25', theme(), 'light', false, W).color).toBe('rgba(37,99,235,0.25)');
  });

  it('slash-opacity at 0 and 100 produces valid rgba bounds', () => {
    expect(resolveStyleJs('bg-blue-6/0', theme(), 'light', false, W).backgroundColor).toBe('rgba(37,99,235,0)');
    expect(resolveStyleJs('bg-blue-6/100', theme(), 'light', false, W).backgroundColor).toBe('rgba(37,99,235,1)');
  });

  it('an opacity suffix over 100 is not treated as opacity, and stays unresolvable', () => {
    expect(resolveStyleJs('bg-blue-6/150', theme(), 'light', false, W)).toEqual({});
  });

  it('merges multiple tokens into one flat object', () => {
    const style = resolveStyleJs('flex flex-row items-center justify-center bg-blue-6', theme(), 'light', false, W);
    expect(Object.keys(style)).toHaveLength(5);
  });

  it('resolves shadow into discrete RN properties with a nested shadowOffset', () => {
    const style = resolveStyleJs('shadow-lg', theme(), 'light', false, W);
    expect(style.shadowColor).toBe('#000000');
    expect(style.shadowOpacity).toBe(0.1);
    expect(style.shadowRadius).toBe(15);
    expect(style.elevation).toBe(8);
    expect(style.shadowOffset).toEqual({ width: 0, height: 10 });
    expect(style.shadowOffsetX).toBeUndefined();
    expect(style.shadowOffsetY).toBeUndefined();
  });

  it('does not resolve shadow-inner on native', () => {
    expect(resolveStyleJs('shadow-inner', theme(), 'light', false, W)).toEqual({});
  });

  it('resolves opacity to a number, not a string', () => {
    expect(resolveStyleJs('opacity-50', theme(), 'light', false, W).opacity).toBe(0.5);
    expect(resolveStyleJs('opacity-[0.42]', theme(), 'light', false, W).opacity).toBe(0.42);
  });

  it('has no negative form for opacity, matching the Rust engine', () => {
    // Regression: resolvePercent (shared.ts) was missing the negative-value
    // guard resolve_percent has in Rust — "-opacity-50" resolved to 0.5 here
    // while the Rust/WASM engine correctly resolved nothing, a real
    // cross-engine divergence for the exact same class string.
    expect(resolveStyleJs('-opacity-50', theme(), 'light', false, W).opacity).toBeUndefined();
  });

  it('resolves the full text-size scale through 9xl, not just up to 4xl', () => {
    // font-size is in NUMERIC_LENGTH_PROPS — rem converts to a plain px number (× 16).
    expect(resolveStyleJs('text-5xl', theme(), 'light', false, W).fontSize).toBe(48);
    expect(resolveStyleJs('text-9xl', theme(), 'light', false, W).fontSize).toBe(128);
  });

  it('resolves the full font-weight scale, including extralight/light/black', () => {
    expect(resolveStyleJs('font-extralight', theme(), 'light', false, W).fontWeight).toBe('200');
    expect(resolveStyleJs('font-light', theme(), 'light', false, W).fontWeight).toBe('300');
    expect(resolveStyleJs('font-black', theme(), 'light', false, W).fontWeight).toBe('900');
  });

  it('resolves logical text-start/text-end alignment', () => {
    expect(resolveStyleJs('text-start', theme(), 'light', false, W).textAlign).toBe('start');
    expect(resolveStyleJs('text-end', theme(), 'light', false, W).textAlign).toBe('end');
  });

  it('resolves a theme-configured font-family to a single stripped name', () => {
    const t = theme({ fontFamily: { sans: 'Inter, sans-serif', display: '"Cal Sans", sans-serif' } });
    expect(resolveStyleJs('font-sans', t, 'light', false, W).fontFamily).toBe('Inter');
    expect(resolveStyleJs('font-display', t, 'light', false, W).fontFamily).toBe('Cal Sans');
    expect(resolveStyleJs('font-[Georgia]', t, 'light', false, W).fontFamily).toBe('Georgia');
    // font-weight still takes priority over any theme-configured family name.
    expect(resolveStyleJs('font-bold', t, 'light', false, W).fontWeight).toBe('700');
  });

  it('resolves justify-normal/stretch and align-content normal', () => {
    expect(resolveStyleJs('justify-normal', theme(), 'light', false, W).justifyContent).toBe('normal');
    expect(resolveStyleJs('justify-stretch', theme(), 'light', false, W).justifyContent).toBe('stretch');
    expect(resolveStyleJs('content-normal', theme(), 'light', false, W).alignContent).toBe('normal');
  });

  it('resolves overflow-clip, overflow-x/y, and overscroll-*', () => {
    expect(resolveStyleJs('overflow-clip', theme(), 'light', false, W).overflow).toBe('clip');
    expect(resolveStyleJs('overflow-x-hidden', theme(), 'light', false, W).overflowX).toBe('hidden');
    expect(resolveStyleJs('overflow-y-scroll', theme(), 'light', false, W).overflowY).toBe('scroll');
    expect(resolveStyleJs('overscroll-contain', theme(), 'light', false, W).overscrollBehavior).toBe('contain');
    expect(resolveStyleJs('overscroll-x-none', theme(), 'light', false, W).overscrollBehaviorX).toBe('none');
    expect(resolveStyleJs('overscroll-y-auto', theme(), 'light', false, W).overscrollBehaviorY).toBe('auto');
  });

  it('resolves inset-x/inset-y to both sides of that axis', () => {
    const t = theme({ spacing: { '4': 16 } });
    const style = resolveStyleJs('inset-x-4', t, 'light', false, W);
    expect(style.left).toBe(16);
    expect(style.right).toBe(16);
    const styleY = resolveStyleJs('inset-y-4', t, 'light', false, W);
    expect(styleY.top).toBe(16);
    expect(styleY.bottom).toBe(16);
  });

  it('resolves top/right/bottom/left/inset percentage fractions, positive and negative', () => {
    const t = theme();
    expect(resolveStyleJs('top-1/2', t, 'light', false, W).top).toBe('50%');
    expect(resolveStyleJs('left-1/2', t, 'light', false, W).left).toBe('50%');
    expect(resolveStyleJs('right-1/3', t, 'light', false, W).right).toBe('33.333333%');
    expect(resolveStyleJs('bottom-1/2', t, 'light', false, W).bottom).toBe('50%');
    expect(resolveStyleJs('inset-1/2', t, 'light', false, W).inset).toBe('50%');
    expect(resolveStyleJs('-top-1/2', t, 'light', false, W).top).toBe('-50%');
  });

  it('resolves logical start/end inset', () => {
    // "inset-inline-start"/"inset-inline-end" aren't in NUMERIC_LENGTH_PROPS
    // (neither engine strips "px" for them) — stays a string, same as Rust.
    const t = theme({ spacing: { '4': 16 } });
    expect(resolveStyleJs('start-4', t, 'light', false, W).insetInlineStart).toBe('16px');
    expect(resolveStyleJs('end-4', t, 'light', false, W).insetInlineEnd).toBe('16px');
  });

  it('resolves aspect-auto and an arbitrary aspect ratio, not just square/video', () => {
    expect(resolveStyleJs('aspect-auto', theme(), 'light', false, W).aspectRatio).toBe('auto');
    expect(resolveStyleJs('aspect-[3/4]', theme(), 'light', false, W).aspectRatio).toBe('3/4');
    expect(resolveStyleJs('aspect-square', theme(), 'light', false, W).aspectRatio).toBe('1 / 1');
    expect(resolveStyleJs('aspect-video', theme(), 'light', false, W).aspectRatio).toBe('16 / 9');
  });

  it('resolves full but not screen sizing on native', () => {
    expect(resolveStyleJs('w-full', theme(), 'light', false, W).width).toBe('100%');
    expect(resolveStyleJs('w-screen', theme(), 'light', false, W).width).toBeUndefined();
  });

  it('does not resolve grid/filter/web-only-transform utilities on native', () => {
    expect(resolveStyleJs('grid-cols-3', theme(), 'light', false, W)).toEqual({});
    // scale-150/rotate-45/translate-x-4 used to be in this list too, before
    // native transform support — see the transform tests below.
    expect(resolveStyleJs('translate-z-4', theme(), 'light', false, W)).toEqual({});
    expect(resolveStyleJs('perspective-normal', theme(), 'light', false, W)).toEqual({});
    expect(resolveStyleJs('blur', theme(), 'light', false, W)).toEqual({});
  });

  it('assembles stacked transform utilities into one canonically-ordered RN array', () => {
    // Written out of canonical order on purpose (scale before rotate before
    // translate) — the assembled array must still come out ordered by
    // TRANSFORM_OP_ORDER, not source order.
    const style = resolveStyleJs('scale-x-75 rotate-45 translate-x-4', theme(), 'light', false, W);
    expect(style.transform).toEqual([{ translateX: 16 }, { rotate: '45deg' }, { scaleX: 0.75 }]);
  });

  it('a later utility overwrites an earlier one on the same transform op', () => {
    const style = resolveStyleJs('scale-x-75 scale-x-50', theme(), 'light', false, W);
    expect(style.transform).toEqual([{ scaleX: 0.5 }]);
  });

  it('transform-none clears any transform ops written before it but not after', () => {
    expect(resolveStyleJs('scale-150 transform-none', theme(), 'light', false, W).transform).toBeUndefined();
    expect(resolveStyleJs('transform-none scale-150', theme(), 'light', false, W).transform).toEqual([
      { scaleX: 1.5 },
      { scaleY: 1.5 },
    ]);
  });

  it('resolves backface visibility as a plain string, not a transform op', () => {
    const style = resolveStyleJs('backface-hidden', theme(), 'light', false, W);
    expect(style.backfaceVisibility).toBe('hidden');
    expect(style.transform).toBeUndefined();
  });

  it('resolves negative translate and rotate-x/y/z via the leading-dash convention and per-axis rotate', () => {
    expect(resolveStyleJs('-translate-x-4', theme(), 'light', false, W).transform).toEqual([{ translateX: -16 }]);
    expect(resolveStyleJs('rotate-x-45', theme(), 'light', false, W).transform).toEqual([{ rotateX: '45deg' }]);
    expect(resolveStyleJs('rotate-y-45', theme(), 'light', false, W).transform).toEqual([{ rotateY: '45deg' }]);
    expect(resolveStyleJs('rotate-z-90', theme(), 'light', false, W).transform).toEqual([{ rotateZ: '90deg' }]);
    expect(resolveStyleJs('skew-x-12', theme(), 'light', false, W).transform).toEqual([{ skewX: '12deg' }]);
  });

  it('resolves translate-x/y fractions to a percentage (the left-1/2 -translate-x-1/2 centering trick)', () => {
    // Regression: translate-x/y used to go through resolveNegatableLength
    // (no fraction support) instead of resolveNegatableSize, so
    // "translate-x-1/2" silently failed to resolve at all — Number("1/2")
    // is NaN — dropping the whole classic centering pattern's transform half.
    expect(resolveStyleJs('translate-x-1/2', theme(), 'light', false, W).transform).toEqual([{ translateX: '50%' }]);
    expect(resolveStyleJs('-translate-x-1/2', theme(), 'light', false, W).transform).toEqual([{ translateX: '-50%' }]);
    expect(resolveStyleJs('translate-y-1/2', theme(), 'light', false, W).transform).toEqual([{ translateY: '50%' }]);
  });

  it('resolves italic but not DOM-only typography-completeness utilities', () => {
    const style = resolveStyleJs('italic decoration-2 underline-offset-4 indent-4', theme(), 'light', false, W);
    expect(style.fontStyle).toBe('italic');
    expect(style.textDecorationThickness).toBeUndefined();
    expect(style.textUnderlineOffset).toBeUndefined();
    expect(style.textIndent).toBeUndefined();
  });

  it('resolves negative margin and inset via the leading dash convention', () => {
    const t = theme({ spacing: { '4': 16 } });
    expect(resolveStyleJs('-mt-4', t, 'light', false, W).marginTop).toBe(-16);
    expect(resolveStyleJs('-mx-4', t, 'light', false, W).marginLeft).toBe(-16);
    expect(resolveStyleJs('-inset-4', t, 'light', false, W).inset).toBe(-16);
    expect(resolveStyleJs('-top-4', t, 'light', false, W).top).toBe(-16);
  });

  it('resolves negative margin/inset/translate via the leading dash on an arbitrary value too', () => {
    // Both writing styles now work — "-mt-[10px]" (leading dash) and
    // "mt-[-10px]" (sign inside the brackets) — and resolve to the exact
    // same real native number via the calc(value * -1) -> reduceConstantMath
    // pipeline, not just as a raw unresolved string.
    const t = theme();
    expect(resolveStyleJs('-mt-[10px]', t, 'light', false, W).marginTop).toBe(-10);
    expect(resolveStyleJs('mt-[-10px]', t, 'light', false, W).marginTop).toBe(-10);
    expect(resolveStyleJs('-top-[1px]', t, 'light', false, W).top).toBe(-1);
    expect(resolveStyleJs('-translate-x-[10px]', t, 'light', false, W).transform).toEqual([{ translateX: -10 }]);
  });

  it('resolves negative z-index and order as a literal dash prefix', () => {
    expect(resolveStyleJs('-z-10', theme(), 'light', false, W).zIndex).toBe(-10);
    expect(resolveStyleJs('-order-1', theme(), 'light', false, W).order).toBe(-1);
  });

  it('has no negative form for padding — the leading dash is simply unresolvable', () => {
    const t = theme({ spacing: { '4': 16 } });
    expect(resolveStyleJs('-p-4', t, 'light', false, W)).toEqual({});
  });

  it('resolves flex-basis via the shared width scale', () => {
    const t = theme({ spacing: { '4': 16 } });
    expect(resolveStyleJs('basis-4', t, 'light', false, W).flexBasis).toBe(16);
    expect(resolveStyleJs('basis-full', t, 'light', false, W).flexBasis).toBe('100%');
  });

  it('resolves per-corner and per-side border-radius', () => {
    const t = theme();
    const tl = resolveStyleJs('rounded-tl-lg', t, 'light', false, W);
    expect(tl.borderTopLeftRadius).toBe(8);
    const top = resolveStyleJs('rounded-t-full', t, 'light', false, W);
    expect(top.borderTopLeftRadius).toBe(9999);
    expect(top.borderTopRightRadius).toBe(9999);
  });

  it('resolves per-side and axis border width/style/color', () => {
    const t = theme({ spacing: { '2': 2 } });
    expect(resolveStyleJs('border-t-2', t, 'light', false, W).borderTopWidth).toBe(2);
    expect(resolveStyleJs('border-b-dashed', t, 'light', false, W).borderBottomStyle).toBe('dashed');
    expect(resolveStyleJs('border-l-blue-6', t, 'light', false, W).borderLeftColor).toBe('#2563eb');
    const axis = resolveStyleJs('border-x-2', t, 'light', false, W);
    expect(axis.borderLeftWidth).toBe(2);
    expect(axis.borderRightWidth).toBe(2);
  });

  it('resolves an inline "/N" slash-opacity suffix on border/ring/outline colors', () => {
    const t = theme();
    expect(resolveStyleJs('border-blue-6/50', t, 'light', false, W).borderColor).toBe('rgba(37,99,235,0.5)');
    expect(resolveStyleJs('border-l-blue-6/50', t, 'light', false, W).borderLeftColor).toBe('rgba(37,99,235,0.5)');
    const axis = resolveStyleJs('border-x-blue-6/50', t, 'light', false, W);
    expect(axis.borderLeftColor).toBe('rgba(37,99,235,0.5)');
    expect(axis.borderRightColor).toBe('rgba(37,99,235,0.5)');
    expect(resolveStyleJs('outline-blue-6/50', t, 'light', false, W).outlineColor).toBe('rgba(37,99,235,0.5)');
  });

  it('resolves text size and align before falling back to color', () => {
    expect(resolveStyleJs('text-lg', theme(), 'light', false, W).fontSize).toBe(18);
    expect(resolveStyleJs('text-center', theme(), 'light', false, W).textAlign).toBe('center');
    expect(resolveStyleJs('text-blue-6', theme(), 'light', false, W).color).toBe('#2563eb');
  });

  it('resolves a constant-only arbitrary calc() to a plain number', () => {
    expect(resolveStyleJs('p-[calc(16px+8px)]', theme(), 'light', false, W).padding).toBe(24);
  });

  it('resolves a constant-only arbitrary clamp() to its clamped number', () => {
    expect(resolveStyleJs('w-[clamp(1rem,2rem,3rem)]', theme(), 'light', false, W).width).toBe(32);
  });

  it('drops an unreducible percentage-relative calc() and returns a warning', () => {
    const { style, warnings } = resolveStyleJsWithWarnings('w-[calc(50%-0.5rem)]', theme(), 'light', false, W);
    expect(style.width).toBeUndefined();
    expect(warnings).toHaveLength(1);
    // normalizeMathWhitespace (parser.ts) inserts the CSS-mandated spacing
    // around the binary "-" before this ever reaches here.
    expect(warnings[0]).toContain('calc(50% - 0.5rem)');
    expect(warnings[0]).toContain('width');
  });

  it('resolveStyleJs without warnings still drops the same invalid value', () => {
    expect(resolveStyleJs('w-[calc(50%-0.5rem)]', theme(), 'light', false, W).width).toBeUndefined();
  });

  it('a plain percentage still passes through without any warning', () => {
    const { style, warnings } = resolveStyleJsWithWarnings('w-1/2', theme(), 'light', false, W);
    expect(style.width).toBe('50%');
    expect(warnings).toHaveLength(0);
  });
});
