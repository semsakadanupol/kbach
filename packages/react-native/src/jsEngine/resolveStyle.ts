/**
 * Port of `resolve_style.rs` — resolves a class string into a flat,
 * React-Native-compatible style object. This is the pure-JS engine's public
 * entry point, used as a fallback when no native TurboModule/WASM path is
 * available (Expo Go) — see nativeBridge.js.ts's own doc comment for when
 * that fallback kicks in.
 *
 * Modifier gating mirrors `native_modifier_state` in resolve_style.rs, but
 * inlined rather than going through a full port of registry.rs: native
 * only ever understands three modifier kinds (dark/active/responsive), so
 * the three checks below ARE registry.rs's entire native-relevant surface
 * — every other modifier (hover, group-*, has-[...], ...) parses without
 * error but never applies here, same as the Rust engine.
 */
import { parseClass } from './parser';
import { resolveUtilityNative } from './resolveUtilityNative';
import { reduceConstantMath } from './calc';
import type { ThemeConfig } from '../theme';
import type { StyleObject } from '../nativeBridge';

const RESPONSIVE_BREAKPOINTS = new Set(['sm', 'md', 'lg', 'xl', '2xl']);

function nativeModifierState(modifier: string, theme: ThemeConfig, colorScheme: string, pressed: boolean, width: number): boolean | null {
  if (modifier === 'dark') return colorScheme === 'dark';
  if (modifier === 'active') return pressed;
  if (RESPONSIVE_BREAKPOINTS.has(modifier)) {
    const minWidth = theme.screens[modifier];
    if (minWidth === undefined) return null;
    return width >= minWidth;
  }
  return null;
}

/** CSS's kebab-case property names -> RN's camelCase style keys. */
function kebabToCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Kebab-case CSS properties whose values RN expects as unitless JS numbers, not strings. */
const NUMERIC_LENGTH_PROPS = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'column-gap', 'row-gap',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'top', 'right', 'bottom', 'left', 'inset',
  'border-radius', 'border-width', 'font-size', 'z-index',
  'line-height', 'letter-spacing',
  'flex', 'flex-grow', 'flex-shrink', 'order', 'flex-basis',
  'shadow-opacity', 'shadow-radius', 'elevation',
  // Per-side border width + per-corner radius — see resolvers/border.ts's
  // new borderSideValue/borderAxisValue/resolveRadiusSide additions; RN's
  // style system wants plain numbers for these exactly like the generic
  // "border-width"/"border-radius" forms above.
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline-width', 'outline-offset',
]);

/** A bare percentage string ("50%", "-33.3%") — see resolve_style.rs's `is_plain_percentage` for why this must be "nothing but a percentage", not just "contains one" (a calc() string can contain a % and still be invalid). */
function isPlainPercentage(value: string): boolean {
  if (!value.endsWith('%')) return false;
  let digits = value.slice(0, -1);
  if (digits.startsWith('-')) digits = digits.slice(1);
  return digits.length > 0 && /^[0-9.]+$/.test(digits);
}

/**
 * Converts a resolved CSS value into its RN-correct JSON shape, mirroring
 * resolve_style.rs's `rn_style_value` exactly (see that function's own doc
 * comment for the full reasoning): strips `px`; converts `rem` × 16; parses
 * a bare numeric string; passes a plain percentage through as-is; reduces a
 * CONSTANT-ONLY `calc()`/`clamp()`/`min()`/`max()` to a single px number
 * (see `./calc.ts`); anything past all of that (an unreduced
 * percentage/viewport-relative calc(), a raw `var(...)`, ...) returns `null`
 * for the value alongside a warning message, meaning the caller must DROP
 * that declaration entirely rather than shipping an invalid string into
 * RN's style object.
 */
function rnStyleValue(property: string, value: string): { value: string | number | null; warning: string | null } {
  if (!NUMERIC_LENGTH_PROPS.has(property)) {
    return { value, warning: null };
  }

  let px: number | null = null;
  if (value.endsWith('px')) {
    const n = Number(value.slice(0, -2));
    px = Number.isFinite(n) ? n : null;
  } else if (value.endsWith('rem')) {
    const n = Number(value.slice(0, -3));
    px = Number.isFinite(n) ? n * 16 : null;
  } else {
    const n = Number(value);
    px = value.trim() !== '' && Number.isFinite(n) ? n : null;
  }
  if (px !== null) return { value: px, warning: null };

  if (isPlainPercentage(value)) {
    return { value, warning: null };
  }

  const reduced = reduceConstantMath(value);
  if (reduced !== null) {
    return { value: reduced, warning: null };
  }

  const warning =
    `Kbach: "${value}" is not a valid native value for "${property}" — dropped. ` +
    'calc()/clamp()/min()/max() only resolve on native when every operand is a ' +
    'constant px/rem length (no %, vw, vh, var(), or other viewport/CSS-variable ' +
    "units — those need real layout/DOM, which doesn't exist on native at paint " +
    'time). Use a plain px/rem calc, a fraction utility (e.g. w-1/2), or resolve ' +
    'this value in JS instead.';
  return { value: null, warning };
}

/**
 * Same resolution `resolveStyleJs` does, plus the list of dev-facing
 * warnings generated along the way (see `rnStyleValue`) — a separate
 * function rather than changing `resolveStyleJs`'s own return type so its
 * many existing call sites (which only ever care about the style object)
 * don't all need updating for a concern most of them never hit. Mirrors
 * resolve_style.rs's own `resolve_style_with_warnings`/`resolve_style` split.
 */
export function resolveStyleJsWithWarnings(
  classString: string,
  theme: ThemeConfig,
  colorScheme: string,
  pressed: boolean,
  width: number,
): { style: StyleObject; warnings: string[] } {
  const style: StyleObject = {};
  const warnings: string[] = [];
  let shadowOffset: { width?: number; height?: number } | null = null;

  for (const token of classString.split(/\s+/).filter(Boolean)) {
    const parsed = parseClass(token);
    const allModifiersHold = parsed.modifiers.every(
      (m) => nativeModifierState(m, theme, colorScheme, pressed, width) === true,
    );
    if (!allModifiersHold) continue;

    const decls = resolveUtilityNative(parsed, theme);
    if (decls === null) continue;

    for (const d of decls) {
      if (d.property.startsWith('__')) {
        // divide/space markers — no RN child-combinator equivalent, out of scope.
        continue;
      }
      if (d.property === 'shadow-offset-x' || d.property === 'shadow-offset-y') {
        const n = Number(d.value);
        if (!Number.isFinite(n)) continue;
        if (shadowOffset === null) shadowOffset = {};
        shadowOffset[d.property === 'shadow-offset-x' ? 'width' : 'height'] = n;
        continue;
      }
      const { value, warning } = rnStyleValue(d.property, d.value);
      if (warning !== null) warnings.push(warning);
      if (value !== null) style[kebabToCamel(d.property)] = value;
    }
  }

  if (shadowOffset !== null) {
    style.shadowOffset = { width: shadowOffset.width ?? 0, height: shadowOffset.height ?? 0 };
  }

  return { style, warnings };
}

export function resolveStyleJs(classString: string, theme: ThemeConfig, colorScheme: string, pressed: boolean, width: number): StyleObject {
  return resolveStyleJsWithWarnings(classString, theme, colorScheme, pressed, width).style;
}
