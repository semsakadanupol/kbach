/** Port of `resolvers/mod.rs`'s shared helpers (`decl`, `resolve_length`, `resolve_percent`). */
import type { ParsedClass } from './parser';
import type { ThemeConfig } from '../theme';

export interface Declaration {
  property: string;
  value: string;
}

export function decl(property: string, value: string): Declaration {
  return { property, value };
}

/**
 * Looks up a spacing STEP against `theme.spacing` first — so a theme
 * customization/extension always wins when present — and falls back to
 * real Tailwind v4's own spacing FORMULA (`n * 4px`, i.e. `n * 0.25rem`)
 * for any bare numeric step the table doesn't have an explicit entry for.
 * Mirrors `resolvers/mod.rs`'s `spacing_px` — see its doc comment for why
 * this is a formula, not just a bigger fixed table.
 */
function spacingPx(theme: ThemeConfig, value: string): number | undefined {
  const fromTable = theme.spacing[value];
  if (fromTable !== undefined) return fromTable;
  const n = Number(value);
  return Number.isFinite(n) && value.trim() !== '' ? n * 4 : undefined;
}

/**
 * Resolves a spacing-scale (or arbitrary) length value shared by every
 * utility that draws from the theme's spacing scale. "full"/"auto" are
 * hardcoded keywords rather than theme.spacing entries — both are valid on
 * native (Yoga accepts 'auto' for margin/width/height, and percentage
 * strings are handled by resolveStyle.ts the same way arbitrary "50%" is).
 */
export function resolveLength(theme: ThemeConfig, parsed: ParsedClass): string | null {
  // Real Tailwind doesn't generate a negative form for padding/gap/width/
  // height/etc. at all — "-p-4" isn't a real Tailwind class — so a leading
  // "-" on a utility that goes through this plain (non-negatable) helper
  // is simply unresolvable, same as any other unknown class, rather than
  // silently being treated as if the "-" weren't there.
  // `resolveNegatableLength` (used by margin/inset) handles `negative`
  // itself instead of ever reaching this check.
  if (parsed.negative) return null;
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) return value;
  if (value === 'full') return '100%';
  if (value === 'auto') return 'auto';
  const px = spacingPx(theme, value);
  return px === undefined ? null : `${px}px`;
}

/**
 * `resolveLength`, but honoring `parsed.negative` (real Tailwind's
 * leading-"-" convention, e.g. "-mt-4") — used by the specific utilities
 * real Tailwind actually allows negative values on: margin and inset/top/
 * right/bottom/left. Negation only applies to the NUMERIC spacing scale
 * (matching real Tailwind) — "full"/"auto" and arbitrary values have no
 * negative form there either, so this returns `null` for those when
 * `parsed.negative` is set rather than emitting nonsensical CSS like
 * "-auto".
 */
export function resolveNegatableLength(theme: ThemeConfig, parsed: ParsedClass): string | null {
  if (!parsed.negative) return resolveLength(theme, parsed);
  if (parsed.isArbitrary) return null;
  const value = parsed.value;
  if (value === null) return null;
  const px = spacingPx(theme, value);
  if (px === undefined) return null;
  if (px === 0) return '0px';
  return `-${px}px`;
}

/** Resolves a 0-100 percentage utility value to a 0-1 decimal string. Arbitrary values pass through as-is. */
export function resolvePercent(parsed: ParsedClass): string | null {
  // Real Tailwind has no negative opacity — same check Rust's
  // resolve_percent makes. Without this, "-opacity-50" resolved to 0.5
  // here (the "-" silently ignored) while the Rust/WASM engine correctly
  // returned null for the same class — a real cross-engine divergence,
  // not a hypothetical: found via review once resolveOpacityNative started
  // actually calling this (previously unused on native).
  if (parsed.negative) return null;
  const value = parsed.value;
  if (value === null) return null;
  if (parsed.isArbitrary) return value;
  const pct = Number(value);
  if (!Number.isFinite(pct) || value.trim() === '') return null;
  return String(pct / 100);
}
