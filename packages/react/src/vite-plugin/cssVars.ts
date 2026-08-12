// Ported from old-kbach/src/vite-plugin.ts's buildColorVarMap/buildSpacingVarMap
// — extracts repeated hex/px values in the assembled CSS text into :root
// custom properties. Mode-aware colors are NOT extracted here: by the time
// css.rs generates a rule, a mode-aware name like "surface" has already
// been expanded into literal light/dark arbitrary hex (see Phase 2's
// expand_mode_aware_color_classes) — that hex is indistinguishable from any
// other arbitrary value at this point, so only plain (string) theme colors
// are recognized. Documented gap, not a silent one — see the Phase 6 plan.
import type { ThemeConfig } from '../theme';

export interface VarMap {
  replacements: Map<string, string>;
  declarations: Map<string, string>;
}

function hexToRgbTriplet(hex: string): string | null {
  const h = hex.replace('#', '');
  const expand = (s: string) => (s.length === 3 ? s.split('').map((c) => c + c).join('') : s);
  const full = expand(h);
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return `${r},${g},${b}`;
}

/**
 * Finds theme colors (plain hex only) actually used in `cssText`, either as
 * a literal declaration value (border-color: #hex) or as the rgba() triplet
 * css.rs's opacity-composition pattern emits (rgba(r,g,b,var(--bg-opacity, 1))).
 */
export function buildColorVarMap(theme: ThemeConfig, cssText: string): VarMap {
  const replacements = new Map<string, string>();
  const declarations = new Map<string, string>();

  for (const [name, value] of Object.entries(theme.colors)) {
    if (typeof value !== 'string') continue; // mode-aware — not extracted, see file header

    const varName = `--color-${name}`;
    if (cssText.includes(value)) {
      replacements.set(value, `var(${varName})`);
      declarations.set(varName, value);
    }

    const triplet = hexToRgbTriplet(value);
    if (!triplet) continue;
    const rgbaPrefix = `rgba(${triplet},`;
    if (cssText.includes(rgbaPrefix)) {
      const rgbVarName = `--color-${name}-rgb`;
      replacements.set(rgbaPrefix, `rgba(var(${rgbVarName}),`);
      declarations.set(rgbVarName, triplet);
    }
  }

  return { replacements, declarations };
}

// Only substitute a spacing-scale px value when it's on a property that
// actually draws from the spacing scale — otherwise a coincidentally
// same-pixel-value on an unrelated property (e.g. a font-size landing on
// the same number as a spacing key) would get wrongly relabeled.
const SPACING_PROPS = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'gap', 'column-gap', 'row-gap',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'top', 'right', 'bottom', 'left',
]);

export function buildSpacingVarMap(theme: ThemeConfig, cssText: string): VarMap {
  const replacements = new Map<string, string>();
  const declarations = new Map<string, string>();

  const pxToKey = new Map<number, string>();
  for (const [key, val] of Object.entries(theme.spacing)) {
    if (!pxToKey.has(val)) pxToKey.set(val, key);
  }
  const varNameFor = (key: string) => `--spacing-${key.replace(/\./g, '_')}`;

  const declRe = /([a-z-]+): (\d+(?:\.\d+)?)px/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(cssText)) !== null) {
    const [, prop, numStr] = m;
    if (!SPACING_PROPS.has(prop!)) continue;
    const key = pxToKey.get(parseFloat(numStr!));
    if (key === undefined) continue;
    const varName = varNameFor(key);
    replacements.set(`${prop}: ${numStr}px`, `${prop}: var(${varName})`);
    declarations.set(varName, `${numStr}px`);
  }

  return { replacements, declarations };
}

/**
 * Applies one or more var maps to `cssText`. Longest patterns first (cheap
 * insurance against partial-match overlap), and every pattern is matched
 * with a negative lookbehind for "\" — regression fix for a confirmed
 * old-kbach bug: a naive string replace matched a color's hex value
 * ANYWHERE in a rule's text, including inside an escaped selector (e.g.
 * `bg-[#6366f1]` escapes to `.bg-\[\#6366f1\]`, which contains the literal
 * substring "#6366f1" right after its escaping backslash). Declaration
 * values are never backslash-prefixed in this codebase — only
 * `css.rs::escape_selector`'s output is — so the lookbehind reliably tells
 * the two apart.
 */
export function applyVarMap(cssText: string, ...maps: VarMap[]): { text: string; declarations: Map<string, string> } {
  const replacements = new Map<string, string>();
  const declarations = new Map<string, string>();
  for (const map of maps) {
    for (const [k, v] of map.replacements) replacements.set(k, v);
    for (const [k, v] of map.declarations) declarations.set(k, v);
  }

  const sorted = [...replacements].sort(([a], [b]) => b.length - a.length);
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = sorted.map(
    ([pattern, replacement]) => [new RegExp(`(?<!\\\\)${escapeRegex(pattern)}`, 'g'), replacement] as const,
  );

  let text = cssText;
  for (const [re, replacement] of patterns) {
    text = text.replace(re, () => replacement);
  }

  return { text, declarations };
}
