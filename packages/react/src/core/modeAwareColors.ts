import type { ColorShades, ThemeColors } from './types';
import { isModeAwareColor } from './colorValue';
import { parseClass, splitClassTokens } from './parser';

interface ModeAwarePair {
  light: string;
  dark: string;
}

// Keyed by the exact token text a color is referenced by: 'surface' for a flat
// color, 'brand-6' for a shade within a scale — matching resolveColor()'s own
// colorPart lookup shape, so a hit here is guaranteed to also be a hit there.
const _modeAwareMapCache = new WeakMap<ThemeColors, ReadonlyMap<string, ModeAwarePair>>();

function buildModeAwareMap(colors: ThemeColors): Map<string, ModeAwarePair> {
  const map = new Map<string, ModeAwarePair>();
  for (const [name, entry] of Object.entries(colors)) {
    if (isModeAwareColor(entry)) {
      map.set(name, entry);
    } else if (entry && typeof entry === 'object') {
      for (const [shade, val] of Object.entries(entry as ColorShades)) {
        if (isModeAwareColor(val)) map.set(`${name}-${shade}`, val);
      }
    }
  }
  return map;
}

function getModeAwareMap(colors: ThemeColors): ReadonlyMap<string, ModeAwarePair> {
  let map = _modeAwareMapCache.get(colors);
  if (!map) {
    map = buildModeAwareMap(colors);
    _modeAwareMapCache.set(colors, map);
  }
  return map;
}

/**
 * Expand every class referencing a mode-aware color (a kbach.config.js color
 * value shaped `{ light, dark }`) into an explicit base + dark: pair BEFORE
 * normal parsing — e.g. `bg-surface` becomes `bg-[#ffffff] dark:bg-[#111827]`.
 * `bg-surface/50` becomes `bg-[#ffffff]/50 dark:bg-[#111827]/50` (the arbitrary-
 * color-plus-opacity composition already resolveColor() already supports).
 *
 * Runs once, upfront, purely as a string rewrite — everything downstream
 * (CSS generation, native bucketing/flatten(), the existing dark: reactivity
 * machinery: DarkWrapper, bucketMods()) then handles the result exactly like
 * a hand-written dark: pair, with zero further changes needed anywhere else.
 * That also means resolve()'s cache (keyed on the ORIGINAL, unexpanded string
 * — see resolver.ts) stays correct without any changes to its cache key.
 */
export function expandModeAwareColorClasses(classString: string, colors: ThemeColors): string {
  const map = getModeAwareMap(colors);
  if (map.size === 0) return classString;

  const tokens = splitClassTokens(classString);
  let changed = false;
  const out: string[] = [];

  for (const token of tokens) {
    const parsed = parseClass(token);
    if (!parsed || parsed.isArbitrary) { out.push(token); continue; }

    // An explicit dark:/light: modifier already stacked on a mode-aware color
    // (e.g. someone writes `dark:bg-surface` not realising surface is already
    // mode-aware) is deliberately left unexpanded — "which side does dark:-on-
    // top-of-already-mode-aware mean" isn't well-defined. resolveColor()'s own
    // fallback (colorValue.ts) picks the light side rather than resolving to
    // nothing in that case.
    if (parsed.modifiers.includes('dark') || parsed.modifiers.includes('light')) {
      out.push(token);
      continue;
    }

    const slashIdx = parsed.value.indexOf('/');
    const colorPart = slashIdx > 0 ? parsed.value.slice(0, slashIdx) : parsed.value;
    const opacitySuffix = slashIdx > 0 ? parsed.value.slice(slashIdx) : '';
    const pair = map.get(colorPart);
    if (!pair) { out.push(token); continue; }

    changed = true;
    const bang = parsed.important ? '!' : '';
    const modPrefix = parsed.modifiers.map((m) => `${m}:`).join('');
    out.push(`${bang}${modPrefix}${parsed.utility}-[${pair.light}]${opacitySuffix}`);
    out.push(`${bang}dark:${modPrefix}${parsed.utility}-[${pair.dark}]${opacitySuffix}`);
  }

  return changed ? out.join(' ') : classString;
}
