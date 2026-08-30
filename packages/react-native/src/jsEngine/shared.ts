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
 * right/bottom/left.
 *
 * An arbitrary value also honors the leading dash (`-mt-[10px]` resolves
 * the same as `mt-[-10px]`) — a deliberate Kbach extension beyond real
 * Tailwind, mirroring `resolvers/mod.rs`'s identical `resolve_negatable_length`
 * on the Rust/WASM side. Wrapped as `calc(<value> * -1)` rather than a
 * plain string negation, since an arbitrary value isn't always a bare
 * number-plus-unit (it can be `calc(...)`, a CSS variable reference, ...)
 * and prefixing those with a literal "-" produces nonsense. This resolves
 * correctly on native too: `resolveStyle.ts`'s `rnStyleValue` already
 * reduces a constant-only `calc()` (via `reduceConstantMath`) to a real
 * number for a numeric-length property — `calc(10px * -1)` reduces to
 * `-10`, the exact same value `mt-[-10px]` itself produces — no separate
 * native-specific handling needed. "full"/"auto" (on the NAMED scale, not
 * arbitrary) still have no negative form — returns `null` for those.
 */
export function resolveNegatableLength(theme: ThemeConfig, parsed: ParsedClass): string | null {
  if (!parsed.negative) return resolveLength(theme, parsed);
  if (parsed.isArbitrary) {
    const value = parsed.value;
    return value === null ? null : `calc(${value} * -1)`;
  }
  const value = parsed.value;
  if (value === null) return null;
  const px = spacingPx(theme, value);
  if (px === undefined) return null;
  if (px === 0) return '0px';
  return `-${px}px`;
}

/**
 * `w-1/2`/`h-2/3`/`top-1/2`-style fractions -> a percentage. Shared by
 * `resolvers/spacing.ts`'s `resolveSize` (width/height-family) and
 * `resolveNegatableSize` (inset-family, below) — real Tailwind's own
 * `top`/`right`/`bottom`/`left`/`inset` scale is the same fraction scale as
 * `width`/`height`'s, just also negatable.
 */
export function fractionPercent(value: string): string | null {
  const slashIdx = value.indexOf('/');
  if (slashIdx === -1) return null;
  const numStr = value.slice(0, slashIdx);
  const denStr = value.slice(slashIdx + 1);
  const num = Number(numStr);
  const den = Number(denStr);
  if (!Number.isFinite(num) || !Number.isFinite(den) || numStr.trim() === '' || denStr.trim() === '') return null;
  if (den === 0) return null;
  const pct = (num / den) * 100;
  const formatted = pct.toFixed(6);
  const trimmed = formatted.replace(/0+$/, '').replace(/\.$/, '');
  return `${trimmed}%`;
}

/**
 * `resolveNegatableLength`, but ALSO checking `fractionPercent` first — used
 * by `top`/`right`/`bottom`/`left`/`inset`/`inset-x`/`inset-y`/`start`/`end`,
 * the one negatable family that (unlike margin, `resolveNegatableLength`'s
 * other caller) real Tailwind also gives a percentage-fraction scale:
 * `top-1/2`, `-inset-1/3`, etc. — the exact "half-way, negatable" pattern
 * `absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` centering
 * relies on. `spacingPx`'s bare `Number("1/2")` is `NaN`, so without this
 * check these utilities silently failed to resolve — a real gap, not a
 * documented exclusion. Checked before falling back to
 * `resolveNegatableLength`'s ordinary spacing-scale/formula/full/auto
 * resolution, same precedence pattern `resolveSize`'s own named/fraction
 * checks already use.
 */
export function resolveNegatableSize(theme: ThemeConfig, parsed: ParsedClass): string | null {
  if (!parsed.isArbitrary && parsed.value !== null) {
    const pct = fractionPercent(parsed.value);
    if (pct !== null) return parsed.negative ? `-${pct}` : pct;
  }
  return resolveNegatableLength(theme, parsed);
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
