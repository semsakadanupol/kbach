import type { ResolvedStyle, StyleValue, ThemeConfig } from './types';
import { BASE_RESET, RESET_STYLE_ID } from './reset';
import { parseClasses } from './parser';
import { resolveUtility, isKnownUtility } from './utilities';
import { LRUCache } from './cache';
import { escapeCSSSelector, isWeb, isNative, getEffectiveIsWeb } from './platform';
import { getGlobalScreens } from './responsiveStore';
import { expandModeAwareColorClasses } from './modeAwareColors';
import {
  getModifier,
  matchModifier,
  getModifierOrder,
  type ModifierDef,
} from './registry';
import { kbachWarn } from './devWarn';
import { getGlobalSingleton } from './globalSingleton';

// ─── Style cache — per-theme, bounded LRU ────────────────────────────────────
//
// Bug #1 fix: keyed by theme object identity via WeakMap.
// Two concurrent ThemeProviders with different configs each get their own LRU
// so they never return each other's resolved styles.
// When updateConfig() creates a new theme object the old cache becomes
// unreachable and is garbage-collected automatically.

// rules: the raw CSS rule strings this classString needs live in the
// injected <style> sheet, each paired with the cascade-order value (see
// registry.ts's ModifierDef.order) its bucket resolved to — re-injecting
// after eviction needs that order again to land back in the right position,
// not just at the end. Stored alongside the resolved style so a cache HIT
// can still re-verify/re-inject them — the rule tracker below
// (_injectedRules) evicts independently from this cache and can drop a
// rule a still-cached classString depends on.
interface CacheEntry {
  result: ResolvedStyle;
  rules: { rule: string; order: number }[];
}

const _themeCache = new WeakMap<object, LRUCache<string, CacheEntry>>();

function getThemeCache(theme: object): LRUCache<string, CacheEntry> {
  let cache = _themeCache.get(theme);
  if (!cache) {
    cache = new LRUCache<string, CacheEntry>(10_000);
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
//
// Backed by getGlobalSingleton() (globalThis-keyed), not a plain module-level
// variable — see darkModeStore.ts's header comment for why core/ being its
// own shared dist/core/ entry isn't enough on its own (only covers the CJS
// build; the separate ESM build inlines its own copy). A primitive can't be
// shared by reference the way an object/Set can, so it's boxed in a
// single-field holder instead.

const _fontFamilyHolder = getGlobalSingleton('defaultFontFamily', () => ({ value: undefined as string | undefined }));

export function setDefaultFontFamily(font: string | undefined): void {
  _fontFamilyHolder.value = font;
}

export function getDefaultFontFamily(): string | undefined {
  return _fontFamilyHolder.value;
}

// ─── CSS injection (web only) ─────────────────────────────────────────────────

let _styleEl: HTMLStyleElement | null = null;

// Bug #12 fix: LRU-bounded instead of unbounded Set. Capacity 50 000 covers
// even the largest apps. Browsers do NOT deduplicate stylesheet rules, so an
// evicted entry's CSS rule is also removed from the live <style> sheet here —
// otherwise re-injecting a class that cycled out of the tracking cache would
// duplicate its rule in the CSSOM and grow the sheet without bound.
//
// Rules are matched by tracked index, not by re-comparing cssText: the browser
// reserializes cssText with its own formatting (e.g. a trailing ";" this codebase
// never emits), so a string-equality scan against sheet.cssRules[i].cssText would
// essentially never match, leaving the CSSOM rule behind even after eviction.
// This map's recorded indices exactly mirror the live sheet as long as every
// insertion/deletion also shifts every other tracked index that comes after it.
const _ruleIndexByKey = new Map<string, number>();

// The cascade-order value (registry.ts's ModifierDef.order, via
// getModifierOrder()) each currently-live rule was inserted with.
// _sheetKeys mirrors the live sheet's rule order exactly (index i here ===
// index i in sheet.cssRules) — kept sorted by order at all times, since every
// insertion below places a new rule immediately before the first existing
// rule with a strictly greater order (a stable sort: ties keep encounter
// order). That invariant is what makes rules with the same modifier order
// always land in the SAME relative position regardless of which one the app
// happened to render/resolve first — e.g. hover: consistently sorts before
// focus: (or whatever registry.ts's order table says), so the pseudo-class
// that wins a same-specificity tie no longer depends on encounter order.
const _sheetKeys: string[] = [];
const _ruleOrderByKey = new Map<string, number>();

// Binary search for the insertion index: the first position in _sheetKeys
// whose order is strictly greater than `order`. Valid because _sheetKeys is
// always kept sorted by order (see above).
function findInsertionIndex(order: number): number {
  let lo = 0, hi = _sheetKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (_ruleOrderByKey.get(_sheetKeys[mid])! > order) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function evictInjectedRule(rule: string): void {
  const idx = _ruleIndexByKey.get(rule);
  _ruleIndexByKey.delete(rule);
  _ruleOrderByKey.delete(rule);
  if (idx === undefined) return;
  const sheet = _styleEl?.sheet;
  if (!sheet) return;
  try { sheet.deleteRule(idx); } catch { return; }
  _sheetKeys.splice(idx, 1);
  for (const [key, i] of _ruleIndexByKey) {
    if (i > idx) _ruleIndexByKey.set(key, i - 1);
  }
}

const _injectedRules = new LRUCache<string, true>(50_000, evictInjectedRule);

// When kbach.css is loaded as a static stylesheet (Vite plugin), runtime CSS
// injection is redundant. Call disableRuntimeCSS() once at startup to skip it.
// Backed by getGlobalSingleton() — see the default-font-family comment above
// / darkModeStore.ts's header comment for why.
const _runtimeCSSHolder = getGlobalSingleton('runtimeCSSDisabled', () => ({ value: false }));
export function disableRuntimeCSS(): void {
  _runtimeCSSHolder.value = true;
}
export function isRuntimeCSSDisabled(): boolean {
  return _runtimeCSSHolder.value;
}

function getStyleEl(): HTMLStyleElement {
  if (_styleEl) return _styleEl;
  _styleEl = document.createElement('style');
  _styleEl.setAttribute('data-kbach', '');
  document.head.appendChild(_styleEl);
  return _styleEl;
}

function injectRule(rule: string, order: number): void {
  if (isRuntimeCSSDisabled()) return;
  // .get() (not .has()) so a reused rule is refreshed to "most recently used" —
  // otherwise a class injected once but referenced for the app's whole lifetime
  // would still be evicted by unrelated churn from newer distinct classes.
  // Already live — its position (and thus its cascade tiebreak behavior) is
  // unaffected by `order` here even if it differs from the original call
  // (can't happen in practice: the same rule text always comes from the same
  // bucketKey, which always resolves to the same order).
  if (_injectedRules.get(rule)) return;
  try {
    const sheet = getStyleEl().sheet;
    if (sheet) {
      const idx = findInsertionIndex(order);
      sheet.insertRule(rule, idx);
      _sheetKeys.splice(idx, 0, rule);
      for (const [key, i] of _ruleIndexByKey) {
        if (i >= idx) _ruleIndexByKey.set(key, i + 1);
      }
      _ruleIndexByKey.set(rule, idx);
      _ruleOrderByKey.set(rule, order);
      _injectedRules.set(rule, true);
    }
  } catch {
    // Rule failed CSS validation — skip silently, and don't mark it injected
    // so a later, valid re-attempt isn't short-circuited by the cache.
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
  // <KbachReset /> (or a static kbach.css, which also inlines BASE_RESET) may
  // have already put these rules on the page — skip re-adding them so a
  // runtime-only app that also renders <KbachReset /> doesn't end up with the
  // same rule set twice.
  const rules: string[] = document.getElementById(RESET_STYLE_ID) ? [] : [BASE_RESET];
  const ff = theme.fontFamily;
  if (ff?.sans && ff.sans !== 'System') {
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

// Properties that only ever appear on TextStyle, never ViewStyle — used by
// flatten() to decide whether a resolved style is plausibly styling a <Text>
// before injecting the native default font (see the call site below).
const TEXT_ONLY_STYLE_KEYS = [
  'color', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
  'letterSpacing', 'lineHeight', 'textAlign', 'textAlignVertical',
  'textDecorationLine', 'textDecorationColor', 'textDecorationStyle',
  'textShadowColor', 'textShadowOffset', 'textShadowRadius',
  'textTransform', 'writingDirection', 'includeFontPadding', 'verticalAlign',
];

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
      // CSS custom properties (--bg-opacity, --text-opacity, …) are raw token
      // streams, not tied to any property's expected unit — every numeric one
      // in this codebase is a dimensionless multiplier read via var() inside
      // another declaration (e.g. an rgba() alpha channel), so a "px" suffix
      // would make that declaration invalid CSS, not just visually wrong.
      const isCustomProp = prop.startsWith('--');
      cssVal = (val === 0 || isCustomProp || CSS_UNITLESS.has(prop)) ? String(val) : `${val}px`;
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
    else if (darkMode === 'class') rule = `.light ${selector} { ${decls} }`;
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
  order: number,
): string[] {
  const cssRules = buildClassCSSRules(cls, bucketKey, styles, darkMode, important, getGlobalScreens());
  for (const r of cssRules) injectRule(r, order);
  return cssRules;
}

export function generateClassCSS(
  classString: string,
  theme: ThemeConfig,
  darkMode: 'attribute' | 'class' | 'media' = 'attribute',
  screens: Record<string, number> = {},
): string {
  const rules: string[] = [];
  for (const parsed of parseClasses(expandModeAwareColorClasses(classString, theme.colors))) {
    const styles = resolveUtility(parsed, theme);
    if (!styles) continue;
    const bucketKey = parsed.modifiers.length === 0 ? 'base' : parsed.modifiers.join(':');
    rules.push(...buildClassCSSRules(parsed.original, bucketKey, styles, darkMode, parsed.important, screens));
  }
  return rules.join('\n');
}

// ─── Core resolver ────────────────────────────────────────────────────────────

// True for utilities whose ENTIRE resolved style is `{ display: ... }` — e.g.
// hidden, flex, block, grid, inline-flex. False for utilities that merely fold
// `display: 'flex'` into a real property as a convenience (items-center,
// justify-center, flex-row, flex-wrap, …, so they work without also needing a
// separate `flex` class) — those have more than just `display` in their style.
function isPureDisplayStyle(styles: StyleValue): boolean {
  const keys = Object.keys(styles);
  return keys.length === 1 && keys[0] === 'display';
}

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
  // Cached (and CSS-injected below) under the ORIGINAL classString — expansion
  // is a pure function of (classString, theme.colors), so this stays correct
  // without the cache key needing to know anything changed.
  //
  // Includes getEffectiveIsWeb() so a process that resolves the SAME theme
  // object for both platforms (shared build tooling, tests importing both the
  // Vite and Babel plugins) never serves one platform's resolved styles to
  // the other — resolveUtility() below is platform-aware via that same call,
  // same class of fix as layout.ts's getStandalone() this session.
  const cacheKey = `${classString}::${darkMode}::${getEffectiveIsWeb() ? 'web' : 'native'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    // Re-verify liveness on every hit, not just the first resolve: the rule
    // tracker (_injectedRules) is a separate, independently-evicting LRU, so
    // a rule this classString needs can be dropped (and deleted from the
    // live <style> sheet) while this entry is still cached. injectRule() is
    // a cheap no-op when the rule is already live.
    if (isWeb) {
      for (const { rule, order } of cached.rules) injectRule(rule, order);
    }
    return cached.result;
  }

  const result: ResolvedStyle = {};
  const rules: { rule: string; order: number }[] = [];
  const onWeb = isWeb;

  for (const parsed of parseClasses(expandModeAwareColorClasses(classString, theme.colors))) {
    const styles = resolveUtility(parsed, theme);
    if (!styles) {
      if (process.env.NODE_ENV !== 'production' && !parsed.isArbitrary && !isKnownUtility(parsed.utility)
          && !parsed.original.startsWith('__')) {
        kbachWarn(`Unknown class "${parsed.original}"`);
      }
      continue;
    }

    const bucketKey = parsed.modifiers.length === 0 ? 'base' : parsed.modifiers.join(':');
    if (!result[bucketKey]) result[bucketKey] = {};
    Object.assign(result[bucketKey]!, styles);

    // Bug #11 fix: no injectQueue allocation — inject directly in the same pass.
    if (onWeb) {
      // Pure-display utilities (hidden, flex, block, grid, …) must always win
      // a same-bucket cascade tie against utilities that only incidentally
      // set display (items-center, justify-center, flex-row, …) — otherwise
      // whichever one the app happens to resolve first wins the equal-
      // specificity tie, so e.g. `hidden` could silently lose to
      // `justify-center` depending on render order. +0.5 keeps it in the same
      // bucket (tiers are spaced >=5 apart, see registry.ts) while guaranteeing
      // it sorts after every other same-bucket rule.
      const order = getModifierOrder(bucketKey) + (isPureDisplayStyle(styles) ? 0.5 : 0);
      for (const r of injectClassRule(parsed.original, bucketKey, styles, darkMode, parsed.important, order)) {
        rules.push({ rule: r, order });
      }
    }
  }

  cache.set(cacheKey, { result, rules });
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
  //
  // Only injected when the resolved style already carries at least one other
  // text-only property (color, fontSize, textAlign, …) — flatten() has no way
  // to know whether the caller is styling a <Text> or a <View> (useStyles() is
  // called directly by both, with no component-type hint at all), and
  // fontFamily is not a valid ViewStyle key. Under React Native's New
  // Architecture (Fabric), an unexpected style key isn't just ignored the way
  // a stray CSS property is on web — it can take the rest of that element's
  // style down with it, silently. A pure-layout style (width/height/padding/
  // background, no text properties at all) is never a Text's only styling, so
  // gating on "has a text property already" keeps real Text elements getting
  // their default font while leaving Views alone.
  if (isNative) {
    const defaultFont = getDefaultFontFamily();
    const r = result as Record<string, unknown>;
    const looksLikeText = TEXT_ONLY_STYLE_KEYS.some((k) => k in r);
    if (defaultFont && looksLikeText && !('fontFamily' in r)) {
      r.fontFamily = defaultFont;
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
  _ruleIndexByKey.clear();
  _ruleOrderByKey.clear();
  _sheetKeys.length = 0;
  if (_styleEl) {
    _styleEl.remove();
    _styleEl = null;
  }
  if (_globalStyleEl) {
    _globalStyleEl.remove();
    _globalStyleEl = null;
  }
}
