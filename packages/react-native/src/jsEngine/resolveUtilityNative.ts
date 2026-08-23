/**
 * Port of `resolvers/mod.rs`'s `resolve_utility_native` — the exact,
 * authoritative dispatch surface for what resolves on React Native.
 * Deliberately NOT the full web engine: grid, filters, backgrounds/
 * gradients, DOM-typography completeness, and interactivity/scroll
 * utilities are excluded here, same as the Rust engine's native dispatcher
 * — see that function's own extensive doc comment for the full reasoning
 * behind each exclusion. Transforms are a partial exception: the web-only
 * CSS-custom-property composition technique (`resolvers/transform.rs`'s
 * `resolve`) is excluded, but its narrower RN-array-shaped sibling
 * (`native_resolve`, ported to `./resolvers/transform.ts`'s `resolveNative`)
 * IS included below. Keep this in sync by diffing against
 * `resolve_utility_native` whenever it changes.
 */
import { decl, resolvePercent, type Declaration } from './shared';
import * as layout from './resolvers/layout';
import * as spacing from './resolvers/spacing';
import * as border from './resolvers/border';
import * as color from './resolvers/color';
import * as typography from './resolvers/typography';
import { nativeShadowDeclarations } from './resolvers/effects';
import { resolveNative as resolveTransformNative } from './resolvers/transform';
import type { ParsedClass } from './parser';
import type { ThemeConfig } from '../theme';

/**
 * The first comma-separated segment of a CSS-shaped font stack, with any
 * surrounding quotes stripped — port of `resolvers/mod.rs`'s
 * `first_font_name`. RN's `fontFamily` prop takes exactly ONE registered
 * font name, not a CSS fallback list.
 */
function firstFontName(stack: string): string {
  const first = stack.split(',')[0] ?? stack;
  return first.trim().replace(/^["']|["']$/g, '');
}

/**
 * `font-<name>` (not a weight keyword) resolves here too, unlike web's
 * `font-family` value — see `resolvers/mod.rs`'s `resolve_typography_native`
 * doc comment for why this takes just the first segment of whatever
 * `fontFamilyValue` returns.
 */
function resolveTypographyNative(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  switch (parsed.utility) {
    case 'font': {
      if (parsed.value === null) return null;
      if (parsed.isArbitrary) {
        return [decl('font-family', firstFontName(parsed.value))];
      }
      const w = typography.fontWeight(parsed.value);
      if (w !== null) return [decl('font-weight', w)];
      const family = typography.fontFamilyValue(theme, parsed.value);
      return family === null ? null : [decl('font-family', firstFontName(family))];
    }
    case 'uppercase':
      return [decl('text-transform', 'uppercase')];
    case 'lowercase':
      return [decl('text-transform', 'lowercase')];
    case 'capitalize':
      return [decl('text-transform', 'capitalize')];
    case 'underline':
      return [decl('text-decoration-line', 'underline')];
    case 'line-through':
      return [decl('text-decoration-line', 'line-through')];
    case 'no-underline':
      return [decl('text-decoration-line', 'none')];
    case 'italic':
      return [decl('font-style', 'italic')];
    case 'not-italic':
      return [decl('font-style', 'normal')];
    default:
      return null;
  }
}

/** Numeric (`leading-6`) and arbitrary (`leading-[24px]`, `tracking-[0.5px]`) line-height/letter-spacing only — named keywords are excluded (cross-token, relative-unit values with no RN equivalent). */
function resolveLeadingTrackingNative(parsed: ParsedClass): Declaration[] | null {
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.utility === 'leading') {
    if (parsed.isArbitrary) return [decl('line-height', value)];
    const v = typography.lineHeightSize(value);
    return v === null ? null : [decl('line-height', v)];
  }
  if (parsed.utility === 'tracking' && parsed.isArbitrary) {
    return [decl('letter-spacing', value)];
  }
  return null;
}

/**
 * Delegates entirely to `color.colorValue` — same arbitrary-passthrough
 * and inline `/N` opacity-suffix handling (`bg-orange-5/50` bakes to an
 * `rgba(...)` string here too) as the web dispatcher's `color_value` gets,
 * so it isn't silently unresolvable on Expo Go the way it used to be.
 */
function nativeHexColor(parsed: ParsedClass, theme: ThemeConfig): string | null {
  return color.colorValue(theme, parsed);
}

/** Mirrors `color::resolve_text`'s three-way "text-" disambiguation (size / align / color). */
function resolveTextNative(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  if (!parsed.isArbitrary && parsed.value !== null) {
    const size = typography.textSize(parsed.value);
    if (size !== null) return [decl('font-size', size)];
    const align = typography.textAlign(parsed.value);
    if (align !== null) return [decl('text-align', align)];
  }
  const hex = nativeHexColor(parsed, theme);
  return hex === null ? null : [decl('color', hex)];
}

function resolveColorNative(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  switch (parsed.utility) {
    case 'bg': {
      const hex = nativeHexColor(parsed, theme);
      return hex === null ? null : [decl('background-color', hex)];
    }
    case 'text':
      return resolveTextNative(parsed, theme);
    default:
      return null;
  }
}

/** RN's `opacity` style is a plain 0-1 number — trivially representable, unlike most of `effects::resolve`'s other web-only arms, so this is a dedicated native entry point rather than a forward to the (excluded) `effects` module wholesale. */
function resolveOpacityNative(parsed: ParsedClass): Declaration[] | null {
  if (parsed.utility !== 'opacity') return null;
  const v = resolvePercent(parsed);
  return v === null ? null : [decl('opacity', v)];
}

export function resolveUtilityNative(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  return (
    layout.resolveFlex(parsed, false) ??
    layout.resolve(parsed, theme) ??
    spacing.resolve(parsed, theme) ??
    border.resolve(parsed, theme) ??
    resolveColorNative(parsed, theme) ??
    resolveLeadingTrackingNative(parsed) ??
    resolveTypographyNative(parsed, theme) ??
    resolveOpacityNative(parsed) ??
    nativeShadowDeclarations(parsed) ??
    resolveTransformNative(parsed, theme)
  );
}
