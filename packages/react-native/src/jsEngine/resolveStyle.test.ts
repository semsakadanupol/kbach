import { describe, it, expect } from 'vitest';
import { resolveStyleJs } from './resolveStyle';
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

  it('resolves full but not screen sizing on native', () => {
    expect(resolveStyleJs('w-full', theme(), 'light', false, W).width).toBe('100%');
    expect(resolveStyleJs('w-screen', theme(), 'light', false, W).width).toBeUndefined();
  });

  it('does not resolve grid/transform/filter utilities on native', () => {
    expect(resolveStyleJs('grid-cols-3', theme(), 'light', false, W)).toEqual({});
    expect(resolveStyleJs('scale-150', theme(), 'light', false, W)).toEqual({});
    expect(resolveStyleJs('blur', theme(), 'light', false, W)).toEqual({});
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

  it('resolves text size and align before falling back to color', () => {
    expect(resolveStyleJs('text-lg', theme(), 'light', false, W).fontSize).toBe(18);
    expect(resolveStyleJs('text-center', theme(), 'light', false, W).textAlign).toBe('center');
    expect(resolveStyleJs('text-blue-6', theme(), 'light', false, W).color).toBe('#2563eb');
  });
});
