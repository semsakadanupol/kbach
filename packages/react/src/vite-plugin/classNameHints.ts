import type { ThemeConfig } from '../theme';

/**
 * Theme-independent utility names and modifier prefixes — mirrors every
 * literal match arm across packages/core-engine/src/resolvers/{layout,
 * border,typography,effects,divide}.rs and registry.rs's modifier table.
 * Hand-maintained, not generated from Rust: this is a TS-only editor-hints
 * concern, not CSS-resolution logic, so it isn't worth new Rust/WASM
 * surface just to enumerate it. Needs a manual touch-up if a future phase
 * adds a new web-side utility keyword — same tradeoff every other
 * hand-ported list in this project has carried, stated plainly rather than
 * silently drifting.
 *
 * Deliberately excluded: utilities whose values are raw numbers with no
 * finite enumerable set (z-, opacity-, duration-, delay-, cursor- beyond a
 * few common ones, leading-/tracking-'s numeric and arbitrary forms (their
 * NAMED keyword scales are enumerable and ARE included below), order-, and
 * grow-/shrink- beyond their 0/1 defaults, and — same reasoning —
 * grid-cols-/grid-rows-/col-span-/row-span-/col-start-/col-end-/row-start-/
 * row-end-'s numeric forms, and transform.rs's scale-/scale-x-/scale-y-/
 * rotate-/skew-x-/skew-y-/translate-x-/translate-y-, and filters.rs's
 * brightness-/contrast-/saturate-/hue-rotate-/backdrop-brightness-/
 * backdrop-contrast-/backdrop-saturate-/backdrop-hue-rotate-/
 * backdrop-opacity-, and typography.rs's decoration-'s numeric thickness
 * and underline-offset-'s numeric forms (their named/keyword values ARE
 * included below), and background.rs's bg-linear-<angle>/conic-<angle> and
 * from-/via-/to-'s numeric position-percentage forms (their color-key forms
 * ARE included below, via COLOR_PREFIXES), and will-change-'s arbitrary
 * form (its named keywords ARE included below)) — nothing meaningful to
 * suggest for those beyond the bare prefix, which would just be noise.
 */
const STRUCTURAL_TOKENS: readonly string[] = [
  // layout.rs
  'flex', 'flex-row', 'flex-col', 'flex-row-reverse', 'flex-col-reverse',
  'flex-wrap', 'flex-wrap-reverse', 'flex-nowrap',
  'flex-1', 'flex-auto', 'flex-initial', 'flex-none',
  'flex-grow', 'flex-grow-0', 'flex-shrink', 'flex-shrink-0',
  'grow', 'grow-0', 'shrink', 'shrink-0',
  'grid', 'block', 'inline-block', 'inline', 'inline-flex', 'inline-grid',
  'contents', 'flow-root', 'hidden',
  'items-center', 'items-start', 'items-end', 'items-baseline', 'items-stretch',
  'justify-center', 'justify-start', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly',
  'content-start', 'content-end', 'content-center', 'content-between', 'content-around', 'content-evenly', 'content-stretch',
  'self-auto', 'self-center', 'self-start', 'self-end', 'self-stretch', 'self-baseline',
  'overflow-hidden', 'overflow-auto', 'overflow-scroll', 'overflow-visible',
  'static', 'relative', 'absolute', 'fixed', 'sticky',
  'aspect-square', 'aspect-video',
  'w-full', 'h-full', 'min-w-full', 'max-w-full', 'min-h-full', 'max-h-full',
  'w-screen', 'h-screen', 'min-w-screen', 'max-w-screen', 'min-h-screen', 'max-h-screen',
  'w-auto', 'h-auto', 'm-auto', 'mx-auto', 'my-auto',

  // grid.rs — web-only (see the module's own doc comment for why)
  'grid-cols-none', 'grid-rows-none',
  'grid-flow-row', 'grid-flow-col', 'grid-flow-dense', 'grid-flow-row-dense', 'grid-flow-col-dense',
  'auto-cols-auto', 'auto-cols-min', 'auto-cols-max', 'auto-cols-fr',
  'auto-rows-auto', 'auto-rows-min', 'auto-rows-max', 'auto-rows-fr',
  'col-span-full', 'row-span-full',
  'col-start-auto', 'col-end-auto', 'row-start-auto', 'row-end-auto',
  'col', 'col-auto', 'row', 'row-auto',
  'place-items-start', 'place-items-end', 'place-items-center', 'place-items-stretch', 'place-items-baseline',
  'place-content-start', 'place-content-end', 'place-content-center', 'place-content-stretch',
  'place-content-between', 'place-content-around', 'place-content-evenly', 'place-content-baseline',
  'place-self-auto', 'place-self-start', 'place-self-end', 'place-self-center', 'place-self-stretch',
  'justify-items-start', 'justify-items-end', 'justify-items-center', 'justify-items-stretch',
  'justify-self-auto', 'justify-self-start', 'justify-self-end', 'justify-self-center', 'justify-self-stretch',

  // transform.rs — web-only (see the module's own doc comment for why)
  'transform-none',
  'origin-center', 'origin-top', 'origin-top-right', 'origin-right', 'origin-bottom-right',
  'origin-bottom', 'origin-bottom-left', 'origin-left', 'origin-top-left',

  // filters.rs — web-only (see the module's own doc comment for why)
  'blur', 'blur-sm', 'blur-md', 'blur-lg', 'blur-xl', 'blur-2xl', 'blur-3xl', 'blur-none',
  'grayscale', 'grayscale-0', 'invert', 'invert-0', 'sepia', 'sepia-0',
  'drop-shadow', 'drop-shadow-sm', 'drop-shadow-md', 'drop-shadow-lg',
  'drop-shadow-xl', 'drop-shadow-2xl', 'drop-shadow-none',
  'filter-none', 'backdrop-filter-none',
  'backdrop-blur', 'backdrop-blur-sm', 'backdrop-blur-md', 'backdrop-blur-lg',
  'backdrop-blur-xl', 'backdrop-blur-2xl', 'backdrop-blur-3xl', 'backdrop-blur-none',
  'backdrop-grayscale', 'backdrop-grayscale-0',
  'backdrop-invert', 'backdrop-invert-0',
  'backdrop-sepia', 'backdrop-sepia-0',

  // border.rs
  'border', 'border-t', 'border-r', 'border-b', 'border-l',
  'rounded', 'rounded-none', 'rounded-sm', 'rounded-md', 'rounded-lg',
  'rounded-xl', 'rounded-2xl', 'rounded-3xl', 'rounded-full',
  'ring', 'ring-0', 'ring-1', 'ring-2', 'ring-4', 'ring-8', 'ring-inset',
  'ring-offset-0', 'ring-offset-1', 'ring-offset-2', 'ring-offset-4', 'ring-offset-8',
  'outline', 'outline-none',
  'border-solid', 'border-dashed', 'border-dotted', 'border-none',

  // typography.rs
  'font-thin', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold',
  'uppercase', 'lowercase', 'capitalize',
  'underline', 'line-through', 'no-underline', 'truncate',
  'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl',
  'text-left', 'text-center', 'text-right', 'text-justify',

  // typography.rs — Phase 20 (typography completeness)
  'italic', 'not-italic',
  'leading-none', 'leading-tight', 'leading-snug', 'leading-normal', 'leading-relaxed', 'leading-loose',
  'tracking-tighter', 'tracking-tight', 'tracking-normal', 'tracking-wide', 'tracking-wider', 'tracking-widest',
  'decoration-auto', 'decoration-from-font',
  'decoration-solid', 'decoration-dashed', 'decoration-dotted', 'decoration-double', 'decoration-wavy',
  'underline-offset-auto', 'underline-offset-0', 'underline-offset-1', 'underline-offset-2', 'underline-offset-4', 'underline-offset-8',
  'text-wrap', 'text-nowrap', 'text-balance', 'text-pretty',
  'whitespace-normal', 'whitespace-nowrap', 'whitespace-pre', 'whitespace-pre-wrap', 'whitespace-pre-line',
  'break-normal', 'break-words', 'break-all',
  'align-baseline', 'align-top', 'align-middle', 'align-bottom', 'align-text-top', 'align-text-bottom', 'align-sub', 'align-super',
  'list-none', 'list-disc', 'list-decimal', 'list-inside', 'list-outside',
  'hyphens-none', 'hyphens-manual', 'hyphens-auto',

  // effects.rs
  'shadow', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl', 'shadow-inner', 'shadow-none',
  'transition', 'transition-none', 'ease-linear', 'ease-in', 'ease-out', 'ease-in-out',
  'cursor-pointer', 'cursor-default', 'cursor-not-allowed', 'cursor-wait',
  'select-none', 'select-text', 'select-all',
  'pointer-events-none', 'pointer-events-auto',

  // effects.rs — Phase 22 (effects completeness)
  'text-shadow', 'text-shadow-sm', 'text-shadow-lg', 'text-shadow-none',
  'mix-blend-normal', 'mix-blend-multiply', 'mix-blend-screen', 'mix-blend-overlay',
  'mix-blend-darken', 'mix-blend-lighten', 'mix-blend-color-dodge', 'mix-blend-color-burn',
  'mix-blend-hard-light', 'mix-blend-soft-light', 'mix-blend-difference', 'mix-blend-exclusion',
  'mix-blend-hue', 'mix-blend-saturation', 'mix-blend-color', 'mix-blend-luminosity', 'mix-blend-plus-lighter',
  'bg-blend-normal', 'bg-blend-multiply', 'bg-blend-screen', 'bg-blend-overlay',
  'bg-blend-darken', 'bg-blend-lighten', 'bg-blend-color-dodge', 'bg-blend-color-burn',
  'bg-blend-hard-light', 'bg-blend-soft-light', 'bg-blend-difference', 'bg-blend-exclusion',
  'bg-blend-hue', 'bg-blend-saturation', 'bg-blend-color', 'bg-blend-luminosity', 'bg-blend-plus-lighter',
  'animate-spin', 'animate-ping', 'animate-pulse', 'animate-bounce', 'animate-none',

  // interactivity.rs — Phase 23 (interactivity & sizing rest)
  'resize', 'resize-none', 'resize-y', 'resize-x',
  'touch-auto', 'touch-none', 'touch-pan-x', 'touch-pan-left', 'touch-pan-right',
  'touch-pan-y', 'touch-pan-up', 'touch-pan-down', 'touch-pinch-zoom', 'touch-manipulation',
  'will-change-auto', 'will-change-scroll', 'will-change-contents', 'will-change-transform',
  'sr-only', 'not-sr-only',
  'border-collapse', 'border-separate', 'table-auto', 'table-fixed', 'caption-top', 'caption-bottom',
  'stroke-width-0', 'stroke-width-1', 'stroke-width-2',

  // spacing.rs — Phase 23 (size-* shorthand + fraction-based width/height)
  'size-full', 'size-auto', 'size-px',
  'w-1/2', 'w-1/3', 'w-2/3', 'w-1/4', 'w-2/4', 'w-3/4', 'w-1/5', 'w-2/5', 'w-3/5', 'w-4/5',
  'w-1/6', 'w-5/6', 'w-1/12', 'w-5/12', 'w-7/12', 'w-11/12',
  'h-1/2', 'h-1/3', 'h-2/3', 'h-1/4', 'h-2/4', 'h-3/4', 'h-1/5', 'h-2/5', 'h-3/5', 'h-4/5', 'h-1/6', 'h-5/6',

  // scroll.rs — Phase 23 (scroll-behavior/-margin/-padding, scroll-snap)
  'scroll-auto', 'scroll-smooth',
  'snap-start', 'snap-end', 'snap-center', 'snap-align-none',
  'snap-normal', 'snap-always',
  'snap-none', 'snap-x', 'snap-y', 'snap-both', 'snap-mandatory', 'snap-proximity',

  // divide.rs
  'divide-x', 'divide-y',

  // background.rs — web-only (see the module's own doc comment for why)
  'bg-top', 'bg-bottom', 'bg-left', 'bg-right', 'bg-center',
  'bg-left-top', 'bg-left-bottom', 'bg-right-top', 'bg-right-bottom',
  'bg-auto', 'bg-cover', 'bg-contain',
  'bg-repeat', 'bg-no-repeat', 'bg-repeat-x', 'bg-repeat-y', 'bg-repeat-round', 'bg-repeat-space',
  'bg-fixed', 'bg-local', 'bg-scroll',
  'bg-clip-border', 'bg-clip-padding', 'bg-clip-content', 'bg-clip-text',
  'bg-origin-border', 'bg-origin-padding', 'bg-origin-content',
  'bg-none',
  'bg-linear-to-t', 'bg-linear-to-tr', 'bg-linear-to-r', 'bg-linear-to-br',
  'bg-linear-to-b', 'bg-linear-to-bl', 'bg-linear-to-l', 'bg-linear-to-tl',
  'bg-radial', 'bg-conic',

  // Ancestor/sibling-state marker classes — carry no styles of their own,
  // just a selector target for group-hover:/peer-hover:/etc. below (see
  // unknownClassWarnings.ts's MARKER_CLASSES for why they need special
  // handling there too).
  'group', 'peer',

  // registry.rs modifiers — bare tokens only, not composed with a
  // following utility (see this module's doc header / the Phase 15 plan).
  'hover:', 'focus:', 'focus-visible:', 'focus-within:', 'active:', 'visited:',
  'disabled:', 'checked:', 'group-hover:', 'group-focus:', 'peer-hover:',
  'peer-focus:', 'peer-checked:', 'dark:', 'motion-safe:', 'motion-reduce:',
  'print:', 'sm:', 'md:', 'lg:', 'xl:', '2xl:',

  // registry.rs modifiers — Phase 24 (expanded variant system), the
  // FIXED/static additions only. Deliberately excluded: every genuinely
  // parameterized modifier (has-[...]/group-has-[...]/peer-has-[...]/
  // data-[...]/aria-[...]/not-[...]/min-[...]/max-[...], and the
  // generalized group-<pseudo>/peer-<pseudo> beyond the five hardcoded
  // combos above) — these have no finite enumerable set (their whole point
  // is arbitrary user-supplied content), so there's nothing meaningful to
  // suggest beyond the bare prefix, same reasoning as every other
  // arbitrary-value exclusion in this file. `not-hover:`/`not-disabled:`/
  // etc. (wrapping a KNOWN static modifier) are excluded for the same
  // reason — enumerable in principle, but a full cross-product with every
  // modifier above would be more noise than signal for an editor hint list.
  'first:', 'last:', 'only:', 'odd:', 'even:', 'open:', 'inert:',
  'aria-checked:', 'aria-disabled:', 'aria-expanded:', 'aria-hidden:',
  'aria-pressed:', 'aria-readonly:', 'aria-required:', 'aria-selected:', 'aria-busy:',

  // Phase 25 (container queries & arbitrary properties). "@container" is a
  // real UTILITY (container-type: inline-size), not a modifier — included
  // as a bare token like "flex"/"hidden" above, not with the trailing ":"
  // the modifier tokens below get. "@sm:"/"@md:"/"@lg:"/"@xl:"/"@2xl:" are
  // container-responsive modifiers (registry.rs's `is_container_responsive`),
  // and "starting:" wraps in @starting-style. Deliberately excluded, same
  // "no finite enumerable set" reasoning as Phase 24's exclusions:
  // "@min-[...]:"/"@max-[...]:" (arbitrary container breakpoints) and every
  // `[property:value]` arbitrary property — both are open-ended by design.
  '@container',
  '@sm:', '@md:', '@lg:', '@xl:', '@2xl:',
  'starting:',
];

/** Utility prefixes whose value is a theme.colors key — color.rs's bg/text/border-color resolution, divide.rs's divide-color, typography.rs's decoration-color (Phase 20), background.rs's gradient color stops (Phase 21). */
const COLOR_PREFIXES = [
  'bg-', 'text-', 'border-', 'divide-', 'decoration-', 'from-', 'via-', 'to-', 'text-shadow-', 'ring-', 'ring-offset-',
  'caret-', 'accent-', 'fill-', 'stroke-',
];

/** Utility prefixes whose value is a theme.spacing key — spacing.rs and layout.rs's inset utilities (resolve_length-based), divide.rs's space-x/space-y, typography.rs's indent- (Phase 20, also resolve_length-based), scroll.rs's scroll-margin/scroll-padding families (Phase 23, also resolve_length-based). */
const SPACING_PREFIXES = [
  'p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-',
  'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-',
  'gap-', 'gap-x-', 'gap-y-',
  'w-', 'h-', 'min-w-', 'max-w-', 'min-h-', 'max-h-', 'size-',
  'top-', 'right-', 'bottom-', 'left-', 'inset-',
  'space-x-', 'space-y-', 'indent-',
  'scroll-m-', 'scroll-mx-', 'scroll-my-', 'scroll-mt-', 'scroll-mr-', 'scroll-mb-', 'scroll-ml-',
  'scroll-p-', 'scroll-px-', 'scroll-py-', 'scroll-pt-', 'scroll-pr-', 'scroll-pb-', 'scroll-pl-',
];

/** The seven size utilities spacing.rs's `named_size` (the sm-9xl container scale) applies to — "size-" (Phase 23) reuses the exact same `resolve_size` as bare "w"/"h". */
const SIZE_PREFIXES = ['w-', 'h-', 'min-w-', 'max-w-', 'min-h-', 'max-h-', 'size-'];
/** spacing.rs's `named_size` keys — theme-independent, hardcoded like border.rs's `radius_size`, so no theme cross-product needed. */
const NAMED_SIZES = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl'];

/** Combines the structural list with every theme-dependent color/spacing token, so suggestions stay accurate to the caller's own theme. */
export function buildClassTokens(theme: ThemeConfig): string[] {
  const tokens = new Set(STRUCTURAL_TOKENS);

  for (const colorKey of Object.keys(theme.colors)) {
    for (const prefix of COLOR_PREFIXES) tokens.add(`${prefix}${colorKey}`);
  }
  for (const spacingKey of Object.keys(theme.spacing)) {
    for (const prefix of SPACING_PREFIXES) tokens.add(`${prefix}${spacingKey}`);
  }
  for (const size of NAMED_SIZES) {
    for (const prefix of SIZE_PREFIXES) tokens.add(`${prefix}${size}`);
  }

  return Array.from(tokens).sort();
}

/**
 * Renders a `.d.ts` widening `className` (on every intrinsic HTML *and*
 * SVG element — @types/react declares it independently in both
 * `HTMLAttributes<T>` and `SVGAttributes<T>`, the latter does NOT extend
 * the former) to a union of known Kbach tokens `| (string & {})`. The
 * `(string & {})` branch is load-bearing, not decorative: a plain `string`
 * alongside the literal union would make TS collapse the whole type back
 * to `string` and DROP the autocomplete suggestions entirely; `string & {}`
 * is structurally still `string` (so any arbitrary class string still
 * type-checks with zero errors) but is a distinct type from the literals,
 * so TS keeps offering them in the completion list.
 *
 * Two branches cover two real typing positions, confirmed to compile
 * (see the Phase 15 plan) rather than assumed: the bare token (first/only
 * class typed) and `${string} ${token}` (typing a new token after any
 * amount of already-typed content, since `${string}` matches whatever
 * precedes it). Full modifier-prefix completion (suggesting utilities
 * *after* `hover:`) is out of scope — see the plan's Context section.
 */
export function buildClassNameHintsDts(tokens: string[]): string {
  const literals = tokens.map((t) => `  | '${t}'`).join('\n');

  return [
    '// Generated by Kbach — do not edit',
    '// Editor autocomplete for className — see packages/react/src/vite-plugin/classNameHints.ts',
    '',
    'type KbachClassToken =',
    literals,
    ';',
    '',
    'export type KbachClassName = KbachClassToken | `${string} ${KbachClassToken}` | (string & {});',
    '',
    "declare module 'react' {",
    '  interface HTMLAttributes<T> {',
    '    className?: KbachClassName | undefined;',
    '  }',
    '  interface SVGAttributes<T> {',
    '    className?: KbachClassName | undefined;',
    '  }',
    '}',
    '',
  ].join('\n');
}
