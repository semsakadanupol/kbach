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

  it('border-2 is 2 on both engines (regression: both gave 8)', () => {
    expect(rust('border-2')).toEqual({ borderWidth: 2 });
    expect(js('border-2')).toEqual({ borderWidth: 2 });
  });
});
