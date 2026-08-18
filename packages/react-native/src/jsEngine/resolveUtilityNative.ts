/**
 * Port of `resolvers/mod.rs`'s `resolve_utility_native` — the exact,
 * authoritative dispatch surface for what resolves on React Native.
 * Deliberately NOT the full web engine: grid, transforms, filters,
 * backgrounds/gradients, DOM-typography completeness, and
 * interactivity/scroll utilities are excluded here, same as the Rust
 * engine's native dispatcher — see that function's own extensive doc
 * comment for the full reasoning behind each exclusion. Keep this in sync
 * by diffing against `resolve_utility_native` whenever it changes.
 */
import { decl, type Declaration } from './shared';
import * as layout from './resolvers/layout';
import * as spacing from './resolvers/spacing';
import * as border from './resolvers/border';
import * as color from './resolvers/color';
import * as typography from './resolvers/typography';
import { nativeShadowDeclarations } from './resolvers/effects';
import type { ParsedClass } from './parser';
import type { ThemeConfig } from '../theme';

function resolveTypographyNative(parsed: ParsedClass): Declaration[] | null {
  switch (parsed.utility) {
    case 'font': {
      if (parsed.value === null) return null;
      const w = typography.fontWeight(parsed.value);
      return w === null ? null : [decl('font-weight', w)];
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

export function resolveUtilityNative(parsed: ParsedClass, theme: ThemeConfig): Declaration[] | null {
  return (
    layout.resolveFlex(parsed, false) ??
    layout.resolve(parsed, theme) ??
    spacing.resolve(parsed, theme) ??
    border.resolve(parsed, theme) ??
    resolveColorNative(parsed, theme) ??
    resolveLeadingTrackingNative(parsed) ??
    resolveTypographyNative(parsed) ??
    nativeShadowDeclarations(parsed)
  );
}
