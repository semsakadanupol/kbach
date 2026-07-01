import type { ResolvedStyle, StyleValue, ThemeConfig } from './types';
import { BASE_RESET } from './reset';
import { parseClasses } from './parser';
import { resolveUtility, isKnownUtility } from './utilities';
import { LRUCache } from './cache';
import { escapeCSSSelector, isWeb, isNative } from './platform';
import { getGlobalScreens } from './responsiveStore';
import {
  getModifier,
  matchModifier,
  type ModifierDef,
} from './registry';

// ─── Style cache — per-theme, bounded LRU ────────────────────────────────────
//
// Bug #1 fix: keyed by theme object identity via WeakMap.
// Two concurrent ThemeProviders with different configs each get their own LRU
// so they never return each other's resolved styles.
// When updateConfig() creates a new theme object the old cache becomes
// unreachable and is garbage-collected automatically.

const _themeCache = new WeakMap<object, LRUCache<string, ResolvedStyle>>();

function getThemeCache(theme: object): LRUCache<string, ResolvedStyle> {
  let cache = _themeCache.get(theme);
  if (!cache) {
    cache = new LRUCache<string, ResolvedStyle>(10_000);
    _themeCache.set(theme, cache);
  }
  return cache;
}

// ─── Flatten sort cache — per-ResolvedStyle object ───────────────────────────
//
// Bug #6 fix: sort()'s result is deterministic for a given resolved object.
// Since resolve() returns the same reference on cache-hit, we memoize the
// sorted entries in a WeakMap so flatten() never re-sorts the same object twice.

const _sortCache = new WeakMap<object, readonly [string, StyleValue][]>();

function getSortedEntries(resolved: ResolvedStyle): readonly [string, StyleValue][] {
  let sorted = _sortCache.get(resolved);
  if (!sorted) {
    const entries = Object.entries(resolved) as [string, StyleValue][];
    entries.sort((a, b) => {
      const pa = a[0] === 'base' ? -1 : a[0].split(':').length;
      const pb = b[0] === 'base' ? -1 : b[0].split(':').length;
      return pa - pb;
    });
    sorted = entries;
    _sortCache.set(resolved, sorted);
  }
  return sorted;
}

// ─── Default font family ──────────────────────────────────────────────────────

const FONT_KEY = '__kbach_default_font__';

export function setDefaultFontFamily(font: string | undefined): void {
  (globalThis as Record<string, unknown>)[FONT_KEY] = font;
}

export function getDefaultFontFamily(): string | undefined {
  return (globalThis as Record<string, unknown>)[FONT_KEY] as string | undefined;
}

// ─── CSS injection (web only) ─────────────────────────────────────────────────

let _styleEl: HTMLStyleElement | null = null;

// Bug #12 fix: LRU-bounded instead of unbounded Set.
// Capacity 50 000 covers even the largest apps; evicted rules may be re-injected
// once (the browser sheet deduplicates at render time).
const _injectedRules = new LRUCache<string, true>(50_000);

// When kbach.css is loaded as a static stylesheet (Vite plugin), runtime CSS
// injection is redundant. Call disableRuntimeCSS() once at startup to skip it.
// globalThis-backed so the flag is shared across CJS bundle splits (Metro).
const _CSS_DISABLED_KEY = '__kbach_runtime_css_disabled__';
export function disableRuntimeCSS(): void {
  (globalThis as Record<string, unknown>)[_CSS_DISABLED_KEY] = true;
}
export function isRuntimeCSSDisabled(): boolean {
  return !!(globalThis as Record<string, unknown>)[_CSS_DISABLED_KEY];
}

function getStyleEl(): HTMLStyleElement {
  if (_styleEl) return _styleEl;
  _styleEl = document.createElement('style');
  _styleEl.setAttribute('data-kbach', '');
  document.head.appendChild(_styleEl);
  return _styleEl;
}

function injectRule(rule: string): void {
  if (isRuntimeCSSDisabled()) return;
  if (_injectedRules.has(rule)) return;
  _injectedRules.set(rule, true);
  try {
    const sheet = getStyleEl().sheet;
    if (sheet) sheet.insertRule(rule, sheet.cssRules.length);
  } catch {
    // Rule failed CSS validation — skip silently
  }
}

// ─── Global config-driven CSS ─────────────────────────────────────────────────

let _globalStyleEl: HTMLStyleElement | null = null;

function getGlobalStyleEl(): HTMLStyleElement {
  if (_globalStyleEl) return _globalStyleEl;
  _globalStyleEl = document.createElement('style');
  _globalStyleEl.setAttribute('data-kbach-global', '');
  document.head.insertBefore(_globalStyleEl, getStyleEl());
  return _globalStyleEl;
}

export function injectGlobalStyles(theme: ThemeConfig): void {
  if (typeof document === 'undefined' || isRuntimeCSSDisabled()) return;
  const rules: string[] = [BASE_RESET];
  const ff = theme.fontFamily;
  if (!ff) return;
  if (ff.sans && ff.sans !== 'System') {
    const family = Array.isArray(ff.sans) ? ff.sans.join(', ') : ff.sans;
    rules.push(`body { font-family: ${family}; }`);
  }
  getGlobalStyleEl().textContent = rules.join('\n');
}

// ─── CSS building helpers ─────────────────────────────────────────────────────
// All modifier → CSS knowledge now lives in registry.ts. These helpers read
// from ModifierDef fields, making them work automatically for plugin modifiers.

function buildDivideDecls(styles: StyleValue, forceImportant?: boolean): string {
  const imp = forceImportant ? ' !important' : '';
  const parts: string[] = [];
  if ('__divideX' in styles) {
    const w = Number(styles.__divideX);
    parts.push(`border-left-width: ${w}px${imp}`, `border-right-width: 0px${imp}`);
  }
  if ('__divideY' in styles) {
    const w = Number(styles.__divideY);
    parts.push(`border-top-width: ${w}px${imp}`, `border-bottom-width: 0px${imp}`);
  }
  if ('__divideColor' in styles) parts.push(`border-color: ${String(styles.__divideColor)}${imp}`);
  if ('__divideStyle' in styles) parts.push(`border-style: ${String(styles.__divideStyle)}${imp}`);
  return parts.join('; ');
}

function buildSpaceDecls(styles: StyleValue, forceImportant?: boolean): string {
  const imp = forceImportant ? ' !important' : '';
  const parts: string[] = [];
  if ('__spaceX' in styles) {
    const v = styles.__spaceX;
    const val = typeof v === 'number' ? `${v}px` : String(v);
    parts.push(`margin-left: ${val}${imp}`);
  }
  if ('__spaceY' in styles) {
    const v = styles.__spaceY;
    const val = typeof v === 'number' ? `${v}px` : String(v);
    parts.push(`margin-top: ${val}${imp}`);
  }
  return parts.join('; ');
}

const RN_ONLY_PROPS = new Set([
  'shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius',
  'elevation', 'includeFontPadding', 'textAlignVertical', 'writingDirection',
  'textShadowColor', 'textShadowOffset', 'textShadowRadius',
  'tintColor',
  '__divideX', '__divideY', '__divideColor', '__divideStyle', '__keyframe',
  '__spaceX', '__spaceY',
]);

const CSS_UNITLESS = new Set([
  'opacity', 'fontWeight', 'flex', 'flexGrow', 'flexShrink',
  'order', 'zIndex', 'aspectRatio', 'columnCount', 'lineHeight',
  'gridColumnStart', 'gridColumnEnd', 'gridRowStart', 'gridRowEnd',
]);

const RN_SHORTHAND_EXPAND: Record<string, [string, string]> = {
  marginHorizontal:  ['margin-left',   'margin-right'],
  marginVertical:    ['margin-top',    'margin-bottom'],
  paddingHorizontal: ['padding-left',  'padding-right'],
  paddingVertical:   ['padding-top',   'padding-bottom'],
};

function styleValueToCSS(styles: StyleValue, forceImportant = false): string {
  const parts: string[] = [];
  for (const [prop, val] of Object.entries(styles)) {
    if (val === undefined || val === null || typeof val === 'object' || RN_ONLY_PROPS.has(prop)) continue;

    let cssVal: string;
    if (typeof val === 'number') {
      cssVal = (val === 0 || CSS_UNITLESS.has(prop)) ? String(val) : `${val}px`;
    } else {
      cssVal = String(val);
    }

    const imp = (
      forceImportant ||
      (prop === 'display' && (cssVal === 'grid' || cssVal === 'inline-grid')) ||
      (prop === 'position' && (cssVal === 'sticky' || cssVal === 'fixed' || cssVal === 'static'))
    ) ? ' !important' : '';

    if (prop in RN_SHORTHAND_EXPAND) {
      const [p1, p2] = RN_SHORTHAND_EXPAND[prop];
      parts.push(`${p1}: ${cssVal}${imp}`, `${p2}: ${cssVal}${imp}`);
      continue;
    }

    parts.push(`${camelToKebab(prop)}: ${cssVal}${imp}`);
  }
  return parts.join('; ');
}

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// ─── CSS rule builder ─────────────────────────────────────────────────────────
//
// Reads entirely from ModifierDef fields in the registry — no local modifier maps.
// Adding a new modifier to registry.ts automatically produces correct CSS here.

export function buildClassCSSRules(
  cls: string,
  bucketKey: string,
  styles: StyleValue,
  darkMode: 'attribute' | 'class' | 'media',
  important: boolean,
  screens: Record<string, number>,
): string[] {
  const rules: string[] = [];

  if ('__keyframe' in styles && typeof styles.__keyframe === 'string') {
    rules.push(styles.__keyframe);
  }

  const isDivide = '__divideX' in styles || '__divideY' in styles ||
                   '__divideColor' in styles || '__divideStyle' in styles;
  const isSpace = '__spaceX' in styles || '__spaceY' in styles;
  const isChildCombinator = isDivide || isSpace;

  const escaped = escapeCSSSelector(cls);
  const childSuffix = isChildCombinator ? ' > * + *' : '';

  if (bucketKey === 'base') {
    const decls = isDivide ? buildDivideDecls(styles, important)
                : isSpace  ? buildSpaceDecls(styles, important)
                :             styleValueToCSS(styles, important);
    if (!decls) return rules;
    rules.push(`.${escaped}${childSuffix} { ${decls} }`);
    return rules;
  }

  const mods = bucketKey.split(':');

  // Partition mods by their registry definition
  let darkScheme: 'dark' | 'light' | undefined;
  let needsImportant = important;
  const pseudoParts: string[] = [];
  const ancestorParts: string[] = [];
  const dirParts: string[] = [];
  const mediaWrappers: string[] = [];
  let minWidth = 0;

  for (const mod of mods) {
    const def: ModifierDef | undefined = getModifier(mod);
    if (!def) continue;

    if (def.darkScheme) darkScheme = def.darkScheme;
    if (def.pseudo) pseudoParts.push(def.pseudo);
    if (def.ancestorSelector) { ancestorParts.push(def.ancestorSelector); needsImportant = true; }
    if (def.dirSelector) { dirParts.push(def.dirSelector); needsImportant = true; }
    if (def.mediaQuery) { mediaWrappers.push(`@media ${def.mediaQuery}`); needsImportant = true; }
    if (def.isResponsive) {
      const w = screens[mod] ?? 0;
      if (w > minWidth) minWidth = w;
    }
    if (def.forcesImportant) needsImportant = true;
  }

  const pseudoSuffix = pseudoParts.join('');
  const elementSelector = `.${escaped}${pseudoSuffix}${childSuffix}`;
  const ancestorPrefix = ancestorParts.join('');
  const dirPrefix = dirParts.join('');
  const selector = `${dirPrefix}${ancestorPrefix}${elementSelector}`;

  const decls = isDivide ? buildDivideDecls(styles, needsImportant)
              : isSpace  ? buildSpaceDecls(styles, needsImportant)
              :             styleValueToCSS(styles, needsImportant);
  if (!decls) return rules;

  let rule: string;
  if (darkScheme === 'dark') {
    if (darkMode === 'media') rule = `@media (prefers-color-scheme: dark) { ${selector} { ${decls} } }`;
    else if (darkMode === 'class') rule = `.dark ${selector} { ${decls} }`;
    else rule = `[data-theme="dark"] ${selector} { ${decls} }`;
  } else if (darkScheme === 'light') {
    if (darkMode === 'media') rule = `@media (prefers-color-scheme: light) { ${selector} { ${decls} } }`;
    else if (darkMode === 'class') rule = `:not(.dark) ${selector} { ${decls} }`;
    else rule = `[data-theme="light"] ${selector} { ${decls} }`;
  } else {
    rule = `${selector} { ${decls} }`;
  }

  // Wrap in @media queries (print, orientation, a11y, …) from inside out
  for (const mw of mediaWrappers) rule = `${mw} { ${rule} }`;

  // Responsive min-width wraps outermost
  if (minWidth > 0) rule = `@media (min-width: ${minWidth}px) { ${rule} }`;

  rules.push(rule);
  return rules;
}

function injectClassRule(
  cls: string,
  bucketKey: string,
  styles: StyleValue,
  darkMode: 'attribute' | 'class' | 'media',
  important: boolean,
): void {
  const cssRules = buildClassCSSRules(cls, bucketKey, styles, darkMode, important, getGlobalScreens());
  for (const r of cssRules) injectRule(r);
}

export function generateClassCSS(
  classString: string,
  theme: ThemeConfig,
  darkMode: 'attribute' | 'class' | 'media' = 'attribute',
  screens: Record<string, number> = {},
): string {
  const rules: string[] = [];
  for (const parsed of parseClasses(classString)) {
    const styles = resolveUtility(parsed, theme);
    if (!styles) continue;
    const bucketKey = parsed.modifiers.length === 0 ? 'base' : parsed.modifiers.join(':');
    rules.push(...buildClassCSSRules(parsed.original, bucketKey, styles, darkMode, parsed.important, screens));
  }
  return rules.join('\n');
}

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a class string to a ResolvedStyle object.
 *
 * Results are cached per (theme, classString, darkMode) — repeated calls with
 * the same arguments are O(1).  Different theme objects each get their own
 * cache so concurrent ThemeProviders with different configs are always correct.
 */
export function resolve(
  classString: string,
  theme: ThemeConfig,
  darkMode: 'attribute' | 'class' | 'media' = 'attribute',
): ResolvedStyle {
  const cache = getThemeCache(theme);
  const cacheKey = `${classString}::${darkMode}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const result: ResolvedStyle = {};
  const onWeb = isWeb;

  for (const parsed of parseClasses(classString)) {
    const styles = resolveUtility(parsed, theme);
    if (!styles) {
      if (process.env.NODE_ENV !== 'production' && !parsed.isArbitrary && !isKnownUtility(parsed.utility)
          && !parsed.original.startsWith('__')) {
        console.warn(`[kbach] Unknown utility "${parsed.utility}" in class "${parsed.original}"`);
      }
      continue;
    }

    const bucketKey = parsed.modifiers.length === 0 ? 'base' : parsed.modifiers.join(':');
    if (!result[bucketKey]) result[bucketKey] = {};
    Object.assign(result[bucketKey]!, styles);

    // Bug #11 fix: no injectQueue allocation — inject directly in the same pass.
    if (onWeb) {
      injectClassRule(parsed.original, bucketKey, styles, darkMode, parsed.important);
    }
  }

  cache.set(cacheKey, result);
  return result;
}

// ─── Flatten ──────────────────────────────────────────────────────────────────

/**
 * Flatten a ResolvedStyle into a single StyleValue for the current runtime state.
 * Used by useStyles() and styled().
 *
 * The sort step is memoized per resolved object reference (#6) — when resolve()
 * returns a cached object, getSortedEntries() is O(1) on all subsequent calls.
 */
export function flatten(
  resolved: ResolvedStyle,
  isDark: boolean,
  state: {
    hover?: boolean; focus?: boolean; pressed?: boolean; active?: boolean;
    disabled?: boolean; checked?: boolean; visited?: boolean; placeholder?: boolean;
  } = {},
  breakpoints: Set<string> = new Set(),
): StyleValue {
  const result: StyleValue = {};

  for (const [key, styles] of getSortedEntries(resolved)) {
    if (!styles) continue;
    if (key === 'base') { Object.assign(result, styles); continue; }
    const mods = key.split(':');
    if (mods.every(mod => matchModifier(mod, isDark, state, breakpoints))) {
      Object.assign(result, styles);
    }
  }

  // fontFamily default is only needed on native — on web, injectGlobalStyles() sets
  // it via `body { font-family: … }` so per-element injection is redundant.
  if (isNative) {
    const defaultFont = getDefaultFontFamily();
    if (defaultFont && !('fontFamily' in (result as Record<string, unknown>))) {
      (result as Record<string, unknown>).fontFamily = defaultFont;
    }
  }

  // Expand RN shorthand properties to explicit CSS keys on web and SSR.
  // isNative is false in both browser and Node.js SSR; only true in React Native.
  if (!isNative) {
    const r = result as Record<string, unknown>;
    // Bug #13 fix: descriptive names instead of v0/v1/v2/v3.
    const ph = r.paddingHorizontal;
    if (ph !== undefined) { r.paddingLeft = ph; r.paddingRight = ph; delete r.paddingHorizontal; }
    const pv = r.paddingVertical;
    if (pv !== undefined) { r.paddingTop = pv; r.paddingBottom = pv; delete r.paddingVertical; }
    const mh = r.marginHorizontal;
    if (mh !== undefined) { r.marginLeft = mh; r.marginRight = mh; delete r.marginHorizontal; }
    const mv = r.marginVertical;
    if (mv !== undefined) { r.marginTop = mv; r.marginBottom = mv; delete r.marginVertical; }
  }

  return result;
}

// ─── Cache reset ──────────────────────────────────────────────────────────────

/**
 * Clear CSS injection state so stale rules are re-injected when the theme changes.
 *
 * The per-theme style cache (WeakMap) does not need to be cleared manually:
 * updateConfig() creates a new theme object, making the old cache entry
 * automatically unreachable for GC.
 */
export function clearCache(): void {
  _injectedRules.clear();
  if (_styleEl) {
    _styleEl.remove();
    _styleEl = null;
  }
  if (_globalStyleEl) {
    _globalStyleEl.remove();
    _globalStyleEl = null;
  }
}
