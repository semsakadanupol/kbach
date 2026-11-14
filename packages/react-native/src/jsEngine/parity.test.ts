import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveStyleJs } from './resolveStyle';
import { defaultTheme } from '../theme';

/**
 * Cross-engine parity: the Expo Go / iOS JS fallback (this directory) must
 * produce the SAME React Native style object as the Rust native engine
 * (`resolve_style_json`, from core-engine's Node-target WASM build, which is
 * the same Rust code the Android `.so` runs). A per-engine unit test can't
 * catch the two drifting apart; this can. The class list covers every
 * native-reaching change from the Tailwind v4 gap pass (border widths, `px`,
 * two-axis translate/skew, rotate/scale-none, flex-N, leading-N, …).
 *
 * Needs core-engine built (`npm run build -w @kbach/core-engine`), which the
 * CI pipeline and the repo's own build order already guarantee. Fails loudly
 * instead of skipping when it isn't, since a skipped parity test looks
 * exactly like a passing one.
 */
const enginePath = join(__dirname, '..', '..', '..', 'core-engine', 'dist-node', 'kbach_core_engine.js');
if (!existsSync(enginePath)) {
  throw new Error(`parity.test.ts: ${enginePath} not found. Build core-engine first: npm run build -w @kbach/core-engine`);
}
const { resolve_style_json } = createRequire(__filename)(enginePath) as {
  resolve_style_json(classString: string, themeJson: string, colorScheme: string, pressed: boolean, width: number): string;
};

const themeJson = JSON.stringify(defaultTheme);
const rust = (cls: string): Record<string, unknown> => {
  const { __kbachWarnings: _warnings, ...style } = JSON.parse(resolve_style_json(cls, themeJson, 'light', false, 400));
  return style;
};
const js = (cls: string): Record<string, unknown> => {
  const { __kbachWarnings: _warnings, ...style } = resolveStyleJs(cls, defaultTheme, 'light', false, 400) as Record<string, unknown>;
  return style;
};

const CASES = [
  // numbered border widths are exact px (both engines used to give n * 4)
  'border-2', 'border-t-4', 'border-l-8', 'border-x-2', 'border-y-4', 'border-0',
  // bare axis borders
  'border-x', 'border-y',
  // px on the spacing scale
  'p-px', 'px-px', '-mt-px', 'h-px', 'w-px', 'gap-px', 'inset-px', 'translate-x-px',
  // two-axis translate / skew, negatives and fractions
  'translate-4', '-translate-2', 'translate-1/2', '-translate-1/2', 'skew-6', '-skew-3',
  // identity resets
  'rotate-45 rotate-none', 'scale-150 scale-none',
  // numbered flex, formula leading
  'flex-2', 'flex-3', 'flex-1', 'leading-6', 'leading-12', 'leading-0.5',
  // radius steps
  'rounded-xs', 'rounded-4xl',
  // per-axis forms unaffected by the new bare prefixes
  'translate-x-4', 'skew-y-2',
  // Tailwind v4.3 values: radius, shadow scale, outlines
  'rounded-sm', 'shadow-sm', 'shadow-xs', 'shadow-2xs', 'shadow', 'shadow-md',
  'outline', 'outline-2', 'outline-3', 'outline-2 outline-dashed', 'outline-none', 'outline-hidden', 'outline-offset-2', 'outline-offset-6',
  // remaining Tailwind v4.3 classes that reach native
  '-top-full', '-inset-x-full', '-translate-x-full', '-translate-full', 'translate-4 translate-none',
  'leading-px',
  // opacity on a non-hex color: web uses color-mix, native keeps the plain color
  'bg-current/50', 'border-current/30',
  // Tailwind v4 syntax: trailing important, type hints, opacity on an arbitrary color
  'p-4!', '-mt-2!', 'text-[length:20px]', 'border-[length:3px]', 'border-[color:#123456]',
  'bg-[#c7a25d]/40', 'bg-[#fff]/50', 'border-[#000]/10', 'text-[clamp(16px,2px,20px)]',
  // negative arbitrary angles
  '-rotate-[30deg]', '-rotate-[-30deg]', '-skew-x-[5deg]', '-rotate-y-[30deg]',
  // number utilities take only numbers and their keywords
  'z-50', '-z-10', 'z-auto', 'order-first', 'order-last', 'order-none', 'order-3', '-order-2', 'grow', 'grow-2', 'shrink-0',
  // text-<size>/<leading> (a named or unitless leading is multiplied out), arbitrary font weights
  'text-sm/6', 'text-lg/tight', 'text-xs/loose', 'text-sm/[20px]', 'text-base/[1.75]', 'text-sm/px',
  'font-[600]', 'font-[number:700]', 'font-[Inter]', 'font-[family-name:Inter]', 'font-[Inter,_sans-serif]',
  // 1.0.0-beta.19, from the comparison with Tailwind CSS 4.3.5 —
  // every opacity form: decimal, bracketed fraction / percentage (named and arbitrary colors)
  'bg-blue-6/2.5', 'bg-blue-6/[0.37]', 'bg-blue-6/[37%]', 'bg-blue-6/57', 'bg-[#ff0000]/[0.37]', 'bg-[#ff0000]/[37%]', 'bg-[#ff0000]/2.5',
  'text-blue-6/[0.5]', 'border-blue-6/[25%]',
  // an arbitrary size with a line height
  'text-[14px]/[20px]', 'text-[14px]/6', 'text-[14px]/[1.5]', 'text-[1rem]/tight',
  // a ratio without brackets; a negative scale and outline offset
  'aspect-3/2', 'aspect-16/9', '-scale-x-100', '-scale-50', '-scale-y-[2]', '-outline-offset-2', '-outline-offset-[3px]',
  // Tailwind's CSS functions in an arbitrary value
  'w-[--spacing(4)]', 'p-[--spacing(2.5)]', 'bg-[--alpha(#ff0000/50%)]',
  // the four palettes Tailwind v4.2 added
  'bg-mauve-6', 'text-olive-8', 'border-mist-3', 'bg-taupe-11/50',
  // a realistic combined string
  'flex-2 border-2 border-x p-px -translate-1/2 rounded-4xl leading-12',
  'rounded-sm shadow-sm outline-2 ring-2 text-sm leading-6',
];

describe('jsEngine <-> Rust native engine parity', () => {
  it.each(CASES)('%s', (cls) => {
    expect(js(cls)).toEqual(rust(cls));
    // and it actually resolved to something (a parity test of two empty objects proves nothing)
    expect(Object.keys(rust(cls)).length).toBeGreaterThan(0);
  });

  it.each([
    'ring', 'ring-2', 'ring-offset-4', 'ring-blue-6',
    // web-only Tailwind v4.1-4.3 families
    'pbs-4', 'mbs-2', 'inset-s-4', 'inset-bs-2', 'scroll-ms-4', 'border-bs-2', 'block-dvh',
    'flex-1/2', 'items-center-safe', 'inset-ring-2', 'inset-shadow-sm', 'mask-t-from-50%', 'mask-linear-45',
    'drop-shadow-blue-6', 'text-shadow-blue-6', 'contain-size', 'wrap-anywhere', 'placeholder-blue-6',
    // not React Native styles: used to leak through as objectPosition/containerType
    'object-top-left', 'object-top', '@container', '@container-normal',
    // arbitrary object-position / vertical-align, duration-initial; a variable line height or
    // weight, and a weight RN can't take (only the hundreds)
    'object-[25%_75%]', 'object-(--p)', 'align-[4px]', 'align-middle', 'duration-initial',
    'text-sm/(--lh)', 'font-(--w)', 'font-[550]',
    // 1.0.0-beta.19: a runtime opacity or line height, size containers, max-w-screen-<bp>,
    // gradients/filters/grid, and the bracket forms on web-only utilities
    'bg-blue-6/(--o)', 'bg-[#ff0000]/(--o)', 'text-[14px]/(--lh)', '@container-size', '@container-size/main', '@container-[size]',
    'max-w-screen-md', 'bg-linear-to-r/oklch', 'grayscale-50', 'grid-cols-13', 'shadow-xl/20', 'shadow-[#333]', 'scale-(--s)',
    'transform-[rotateX(10deg)]', 'list-[upper-roman]', 'contain-[layout_paint]', 'content-none',
  ])('%s is web-only: no style on either engine', (cls) => {
    // Regression: native used to receive `KbRingWidth` and a var()-built
    // `boxShadow` string, neither of which RN can use.
    expect(rust(cls)).toEqual({});
    expect(js(cls)).toEqual({});
  });

  it('no CSS variable or var() value reaches React Native from either engine', () => {
    const cls = 'outline-2 outline-dashed ring text-sm leading-8 transition-colors duration-200';
    for (const style of [rust(cls), js(cls)]) {
      for (const [k, v] of Object.entries(style)) {
        expect(k.startsWith('Kb') || k.startsWith('--')).toBe(false);
        expect(String(v)).not.toContain('var(');
      }
    }
  });

  describe('breakpoints from the theme: custom names and max-<name>', () => {
    // kbach.config.js: extend.screens: { tablet: 900, '3xl': 1920 }
    const theme = { ...defaultTheme, screens: { ...defaultTheme.screens, tablet: 900, '3xl': 1920 } };
    const themeJsonWide = JSON.stringify(theme);
    const at = (cls: string, width: number) => {
      const { __kbachWarnings: _r, ...r } = JSON.parse(resolve_style_json(cls, themeJsonWide, 'light', false, width));
      const { __kbachWarnings: _j, ...j } = resolveStyleJs(cls, theme, 'light', false, width) as Record<string, unknown>;
      return { r, j };
    };
    const CLASSES = [
      '3xl:p-4', 'tablet:flex-row', 'max-md:p-4', 'max-3xl:p-4', 'max-tablet:p-4',
      'md:max-xl:p-2', 'bg-white max-md:bg-black', 'p-1 tablet:p-2 3xl:p-3',
      // min-<name> is the breakpoint spelled out; web-only variants never apply on native
      'min-md:p-4', 'min-tablet:p-4', 'min-nope:p-4', 'data-open:p-4', 'group-data-open:p-4', 'has-checked:p-4', 'forced-colors:p-4', '@sm:p-4',
      // never a breakpoint: unknown names, and inherited Object properties
      'hovr:p-4', 'max-nope:p-4', 'constructor:p-4', 'max-constructor:p-4', 'toString:p-4',
      // named containers are web-only
      '@container/main',
      // not- on a breakpoint; max-[…] is strictly below (800 is one of the widths)
      'not-md:p-4', 'not-max-md:p-4', 'not-min-md:p-4', 'not-tablet:p-4', 'not-3xl:p-4', 'not-nope:p-4', 'not-constructor:p-4',
      'max-[800px]:p-4', 'min-[800px]:p-4', 'max-[50rem]:p-4', 'not-hover:p-4', 'pointer-none:p-4', 'hover:p-4',
    ];
    it.each(CLASSES)('%s matches at every width', (cls) => {
      for (const width of [300, 800, 1000, 1500, 2000]) {
        const { r, j } = at(cls, width);
        expect(j, cls + ' at ' + width).toEqual(r);
      }
    });
    it('custom and max- breakpoints apply at the right widths', () => {
      expect(at('3xl:p-4', 2000).r).toEqual({ padding: 16 });
      expect(at('3xl:p-4', 1919).r).toEqual({});
      expect(at('tablet:flex-row', 900).r).toEqual({ flexDirection: 'row' });
      expect(at('max-md:p-4', 767).r).toEqual({ padding: 16 });
      expect(at('max-md:p-4', 768).r).toEqual({}); // max-<bp> is below the breakpoint, not at it
      expect(at('md:max-xl:p-2', 1000).r).toEqual({ padding: 8 });
      expect(at('md:max-xl:p-2', 1300).r).toEqual({});
      expect(at('p-1 tablet:p-2 3xl:p-3', 1000).r).toEqual({ padding: 8 });
      expect(at('p-1 tablet:p-2 3xl:p-3', 2000).r).toEqual({ padding: 12 });
      expect(at('constructor:p-4', 2000).j).toEqual({});
      expect(at('not-md:p-4', 767).r).toEqual({ padding: 16 });
      expect(at('not-md:p-4', 768).r).toEqual({});
      expect(at('not-max-md:p-4', 768).r).toEqual({ padding: 16 });
      expect(at('max-[800px]:p-4', 799).r).toEqual({ padding: 16 });
      expect(at('max-[800px]:p-4', 800).r).toEqual({}); // strictly below, like max-md
    });

    it('not-dark is the other color scheme, on both engines', () => {
      for (const scheme of ['light', 'dark']) {
        const { __kbachWarnings: _r, ...r } = JSON.parse(resolve_style_json('not-dark:p-4 dark:p-2', themeJsonWide, scheme, false, 400));
        const { __kbachWarnings: _j, ...j } = resolveStyleJs('not-dark:p-4 dark:p-2', theme, scheme, false, 400) as Record<string, unknown>;
        expect(j).toEqual(r);
        expect(r).toEqual({ padding: scheme === 'dark' ? 8 : 16 });
      }
    });
  });

  it.each(['z-banana', 'order-banana', 'grow-banana', 'shrink-banana', 'z-1.5', 'text-sm/banana', 'text-sm/', 'align-banana'])('%s is not a class on either engine', (cls) => {
    // Regression: these used to pass any value through (z-index: banana).
    expect(rust(cls)).toEqual({});
    expect(js(cls)).toEqual({});
  });

  it('border-2 is 2 on both engines (regression: both gave 8)', () => {
    expect(rust('border-2')).toEqual({ borderWidth: 2 });
    expect(js('border-2')).toEqual({ borderWidth: 2 });
  });
});
