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
 *
 * Deliberately does NOT port resolve_style.rs's typo/unknown-utility
 * warning (`is_recognized_utility`, in resolve_style.rs): that check's
 * ground truth is `resolve_utility` — the WEB dispatcher, the FULL Kbach
 * vocabulary — used specifically so a real utility this engine just
 * doesn't support yet (grid-cols-3, scale-150, blur, ...) is never
 * mistaken for a typo. This jsEngine directory has no web-shaped resolver
 * at all (it only ports the NATIVE subset — see resolveUtilityNative.ts's
 * own doc comment), so there's no equivalent full-vocabulary ground truth
 * to check against here without porting the entire web resolver just for
 * this. Expo Go therefore doesn't get typo warnings today — a real,
 * intentionally scoped gap (same category as the jsEngine's existing
 * documented parity subset), not an oversight.
 */
import { parseClass } from './parser';
import { resolveUtilityNative } from './resolveUtilityNative';
import { reduceConstantMath } from './calc';
import { substituteModeAwareColorToken } from './resolvers/color';
import type { ThemeConfig } from '../theme';
import type { StyleObject } from '../nativeBridge';

const RESPONSIVE_BREAKPOINTS = new Set(['sm', 'md', 'lg', 'xl', '2xl']);

/**
 * `jsxRuntimeCore.ts`'s stand-in for an already-satisfied prop-based state
 * modifier (`hover:`/`focus:`/`disabled:`/`aria-*`/`data-*`), one per
 * satisfied modifier — mirrors `resolve_style.rs`'s `STATE_HOLD_MARKER`
 * exactly. Counts toward a token's specificity here (see `tokenSpecificity`)
 * so a satisfied `hover:bg-x` beats a plain `bg-y` regardless of source
 * order, the same as `dark:` does.
 */
const STATE_HOLD_MARKER = '_kbon';

function nativeModifierState(modifier: string, theme: ThemeConfig, colorScheme: string, pressed: boolean, width: number): boolean | null {
  if (modifier === STATE_HOLD_MARKER) return true;
  if (modifier === 'dark') return colorScheme === 'dark';
  if (modifier === 'active') return pressed;
  if (RESPONSIVE_BREAKPOINTS.has(modifier)) {
    const minWidth = theme.screens[modifier];
    if (minWidth === undefined) return null;
    return width >= minWidth;
  }
  // Arbitrary min-[500px]:/max-[30rem]: — the exact same width comparison
  // the named breakpoints above already do, parsed out of the modifier's
  // own bracket content instead of looked up from theme.screens by name.
  // Mirrors resolve_style.rs's identical native_modifier_state extension —
  // reuses reduceConstantMath (wrapped in a trivial calc(...), since that
  // function only recognizes an actual calc/min/max/clamp call, not a bare
  // value on its own) for the same px/rem parsing every other arbitrary
  // length already goes through. A percentage/viewport-unit value stays
  // unreducible (null) — no live layout to resolve it against at the point
  // a modifier's state is decided, same as everywhere else on native.
  if (modifier.startsWith('min-[') && modifier.endsWith(']')) {
    const px = reduceConstantMath(`calc(${modifier.slice(5, -1).trim()})`);
    return px === null ? null : width >= px;
  }
  if (modifier.startsWith('max-[') && modifier.endsWith(']')) {
    const px = reduceConstantMath(`calc(${modifier.slice(5, -1).trim()})`);
    return px === null ? null : width <= px;
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
  'shadow-opacity', 'shadow-radius', 'elevation', 'opacity',
  // Per-side border width + per-corner radius — see resolvers/border.ts's
  // new borderSideValue/borderAxisValue/resolveRadiusSide additions; RN's
  // style system wants plain numbers for these exactly like the generic
  // "border-width"/"border-radius" forms above.
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline-width', 'outline-offset',
  // The transform ops whose RN value is a plain JS number — translate takes
  // a length (px/percentage, same as top/left/etc. above) and scale takes a
  // bare decimal factor (parsed by the same "raw value" fallback branch
  // below). transform-op-rotate*/transform-op-skew* stay OUT of this set on
  // purpose, since RN wants those as literal "45deg"-shaped strings, not
  // numbers. See the transform-ops accumulator below for how these markers
  // get collected into the final array.
  'transform-op-translate-x', 'transform-op-translate-y',
  'transform-op-scale-x', 'transform-op-scale-y',
]);

/** Marker property name (`resolvers/transform.ts`'s output) -> the RN transform-op key it accumulates into. */
const TRANSFORM_OP_KEYS: ReadonlyMap<string, string> = new Map([
  ['transform-op-translate-x', 'translateX'],
  ['transform-op-translate-y', 'translateY'],
  ['transform-op-rotate', 'rotate'],
  ['transform-op-rotate-x', 'rotateX'],
  ['transform-op-rotate-y', 'rotateY'],
  ['transform-op-rotate-z', 'rotateZ'],
  ['transform-op-skew-x', 'skewX'],
  ['transform-op-skew-y', 'skewY'],
  ['transform-op-scale-x', 'scaleX'],
  ['transform-op-scale-y', 'scaleY'],
]);

/** Fixed emission order for the assembled `transform` array, independent of source class order — same as TRANSFORM_OP_ORDER in resolve_style.rs. */
const TRANSFORM_OP_ORDER: readonly string[] =
  ['translateX', 'translateY', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY', 'scaleX', 'scaleY'];

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
  // `aspect-ratio` -> a plain number (RN's New-Architecture prop parser
  // won't apply a CSS ratio string like "3 / 4"). Mirrors resolve_style.rs.
  if (property === 'aspect-ratio') {
    if (value.trim() === 'auto') return { value: null, warning: null };
    const parts = value.split('/').map((s) => s.trim());
    let n: number | null = null;
    if (parts.length === 1) {
      const a = Number(parts[0]);
      n = Number.isFinite(a) ? a : null;
    } else if (parts.length === 2) {
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      n = Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;
    }
    return { value: n, warning: null };
  }

  if (!NUMERIC_LENGTH_PROPS.has(property)) {
    return { value, warning: null };
  }

  // `auto` is a real RN/Yoga value for margin (auto margins — `mx-auto`),
  // width/height, inset, and flex-basis — pass it through rather than
  // failing the numeric coercion below and dropping it. Mirrors
  // resolve_style.rs.
  if (value === 'auto') {
    return { value: 'auto', warning: null };
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

  // One short line per fact (headline, reason, fix) rather than a single
  // run-on paragraph — plain text, no ANSI/`%c` (this reaches RN's
  // on-device LogBox, which renders raw text only — see nativeBridge.ts's
  // own doc comment on `warnIfDev` for where this ends up printed, and
  // @kbach/react-native's ThemeProvider.tsx for the same constraint).
  // Mirror any wording change here in resolve_style.rs's identical Rust
  // warning (the native/JNI path's own copy of this exact message).
  const warning =
    `[Kbach] "${value}" isn't a valid native value for "${property}" — dropped.\n` +
    'calc()/min()/max()/clamp() only resolve on native when every operand is a constant px/rem length ' +
    '(no %, vw, vh, var(), or other viewport/CSS-variable units — those need real layout/DOM, which ' +
    "doesn't exist on native at paint time).\n" +
    'Fix: use a plain px/rem calc, a fraction utility (e.g. w-1/2), or resolve this value in JS instead.';
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
  // Accumulates transform-op-* markers into RN's ordered `transform` array
  // at the end — assembled in TRANSFORM_OP_ORDER once the whole class
  // string has been processed. Per op, the same specificity rule the rest
  // of `style` follows applies (a dark:rotate-* beats a plain rotate-*
  // either order), last-write per op for equal specificity.
  // transform-op-none (from transform-none) is the exception: it clears the
  // whole accumulator the moment it's seen, regardless of specificity.
  const transformOps = new Map<string, string | number>();
  // Highest specificity (satisfied-modifier count) seen so far for each
  // output key — a later token only overwrites a key it's at least as
  // specific as, so `dark:bg-black bg-white` and `bg-white dark:bg-black`
  // both end up black in dark mode. Ties fall back to source order. Mirrors
  // resolve_style.rs's `key_specificity`/`transform_specificity`; missing
  // === 0, so plain (unmodified) tokens keep pure last-wins among
  // themselves.
  const keySpecificity = new Map<string, number>();
  const transformSpecificity = new Map<string, number>();

  for (const rawToken of classString.split(/\s+/).filter(Boolean)) {
    // A mode-aware color name (`bg-surface`) is rewritten to the ONE hex
    // value matching `colorScheme` here, before parsing — see
    // `substituteModeAwareColorToken`'s own doc comment. A token naming no
    // mode-aware color passes through unchanged.
    const token = substituteModeAwareColorToken(rawToken, theme, colorScheme);
    const parsed = parseClass(token);
    const allModifiersHold = parsed.modifiers.every(
      (m) => nativeModifierState(m, theme, colorScheme, pressed, width) === true,
    );
    if (!allModifiersHold) continue;

    const decls = resolveUtilityNative(parsed, theme);
    if (decls === null) continue;

    // Every modifier here is satisfied (checked just above) — its count is
    // the token's specificity, same metric as resolve_style.rs's
    // `token_specificity`.
    const spec = parsed.modifiers.length;

    for (const d of decls) {
      if (d.property.startsWith('__')) {
        // divide/space markers — no RN child-combinator equivalent, out of scope.
        continue;
      }
      if (d.property === 'shadow-offset-x' || d.property === 'shadow-offset-y') {
        // One nested `{width, height}` key — treat as a single unit for
        // specificity, same as resolve_style.rs.
        if (spec < (keySpecificity.get('shadowOffset') ?? 0)) continue;
        const n = Number(d.value);
        if (!Number.isFinite(n)) continue;
        if (shadowOffset === null) shadowOffset = {};
        shadowOffset[d.property === 'shadow-offset-x' ? 'width' : 'height'] = n;
        keySpecificity.set('shadowOffset', spec);
        continue;
      }
      if (d.property === 'transform-op-none') {
        // Reset directive — clears every op regardless of what set it, and
        // resets the ceiling; deliberately stays source-order-sensitive.
        transformOps.clear();
        transformSpecificity.clear();
        continue;
      }
      const opKey = TRANSFORM_OP_KEYS.get(d.property);
      if (opKey !== undefined) {
        if (spec < (transformSpecificity.get(opKey) ?? 0)) continue;
        const { value, warning } = rnStyleValue(d.property, d.value);
        if (warning !== null) warnings.push(warning);
        if (value !== null) {
          transformOps.set(opKey, value);
          transformSpecificity.set(opKey, spec);
        }
        continue;
      }
      const key = kebabToCamel(d.property);
      if (spec < (keySpecificity.get(key) ?? 0)) continue;
      const { value, warning } = rnStyleValue(d.property, d.value);
      if (warning !== null) warnings.push(warning);
      if (value !== null) {
        style[key] = value;
        keySpecificity.set(key, spec);
      }
    }
  }

  if (shadowOffset !== null) {
    style.shadowOffset = { width: shadowOffset.width ?? 0, height: shadowOffset.height ?? 0 };
  }

  if (transformOps.size > 0) {
    style.transform = TRANSFORM_OP_ORDER.filter((key) => transformOps.has(key)).map((key) => ({
      [key]: transformOps.get(key)!,
    }));
  }

  return { style, warnings };
}

export function resolveStyleJs(classString: string, theme: ThemeConfig, colorScheme: string, pressed: boolean, width: number): StyleObject {
  return resolveStyleJsWithWarnings(classString, theme, colorScheme, pressed, width).style;
}
