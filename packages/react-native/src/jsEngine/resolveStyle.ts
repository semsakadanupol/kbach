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

/** Converts a resolved CSS value into its RN-correct JSON shape (strips `px`, converts `rem` × 16, or passes the raw string through — e.g. an arbitrary "50%"). */
function rnStyleValue(property: string, value: string): string | number {
  if (NUMERIC_LENGTH_PROPS.has(property)) {
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
    if (px !== null) return px;
  }
  return value;
}

export function resolveStyleJs(classString: string, theme: ThemeConfig, colorScheme: string, pressed: boolean, width: number): StyleObject {
  const style: StyleObject = {};
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
      style[kebabToCamel(d.property)] = rnStyleValue(d.property, d.value);
    }
  }

  if (shadowOffset !== null) {
    style.shadowOffset = { width: shadowOffset.width ?? 0, height: shadowOffset.height ?? 0 };
  }

  return style;
}
