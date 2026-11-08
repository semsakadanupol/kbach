import { generateCss } from './wasmLoader';
import { getTheme, getThemeJson } from './theme';
import { ensureColorVariablesInjected, withColorVariables } from './colorVariables';
import { BASE_RESET, RESET_STYLE_ID } from './reset';

interface RuleEntry {
  rule: string;
  order: number;
}

interface GenerateCssResult {
  /**
   * The mode-aware-expanded class string (e.g. "bg-surface" ->
   * "bg-[#f9fafb] dark:bg-[#111827]") — MUST be used as the element's
   * className, not the original input: the CSS rules are generated against
   * the expanded token text, so an element carrying the un-expanded
   * className would never match its own mode-aware-color selectors.
   */
  className: string;
  rules: RuleEntry[];
}

// When a static kbach.css (see vite-plugin/index.ts) already provides every
// rule (the jsx-runtime path over a fully scanned app), runtime injection
// is redundant — call disableRuntimeCSS() once at startup to skip it. kb()
// still calls the engine for the returned className; only the
// sheet.insertRule side effect is skipped. Without it, kb() already skips
// the classes the static sheet defines (see `staticClasses`).
let runtimeCSSDisabled = false;

export function disableRuntimeCSS(): void {
  runtimeCSSDisabled = true;
}

export function isRuntimeCSSDisabled(): boolean {
  return runtimeCSSDisabled;
}

let styleEl: HTMLStyleElement | null = null;

// Mirrors the live <style> sheet's rule order exactly — kept sorted by
// `order` at all times (a stable sort: same-order rules keep insertion
// order), so a rule's position — and therefore which same-specificity rule
// wins a cascade tie — depends on its registry-defined order, not on
// whichever kb() call happened to resolve it first. Port of old-kbach's
// core/resolver.ts injector (`_sheetKeys`/`_ruleOrderByKey`/`findInsertionIndex`).
const sheetKeys: string[] = [];
const ruleOrderByKey = new Map<string, number>();

function getStyleEl(): HTMLStyleElement {
  if (styleEl) return styleEl;
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-kbach', '');
  document.head.appendChild(styleEl);
  return styleEl;
}

/** First position in `sheetKeys` whose order is strictly greater than `order` — valid because `sheetKeys` is always kept sorted by order. */
function findInsertionIndex(order: number): number {
  let lo = 0;
  let hi = sheetKeys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (ruleOrderByKey.get(sheetKeys[mid]!)! > order) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function injectRule(rule: string, order: number): void {
  if (ruleOrderByKey.has(rule)) return; // already live — no-op

  const sheet = getStyleEl().sheet;
  if (!sheet) return;

  const idx = findInsertionIndex(order);
  try {
    sheet.insertRule(rule, idx);
  } catch {
    // Invalid/unsupported rule text — skip rather than crash rendering, and
    // don't mark it as tracked so a later, valid re-attempt isn't blocked.
    return;
  }
  sheetKeys.splice(idx, 0, rule);
  ruleOrderByKey.set(rule, order);
}

// Checked once, on the first kb() call that actually injects — not a plain
// <style data-kbach> rule (it has no `order`, isn't a utility class rule,
// and always needs to sit before every utility rule regardless of any of
// their orders), so it gets its own element rather than going through
// injectRule/findInsertionIndex. Skipped if <KbachReset/> (or a static
// kbach.css, which also inlines BASE_RESET) already rendered the same id —
// checked via the DOM, not just a local flag, since either of those can
// exist before this module's own state does (e.g. SSR).
let resetChecked = false;

function ensureResetInjected(): void {
  if (resetChecked) return;
  resetChecked = true;
  if (document.getElementById(RESET_STYLE_ID)) return;

  const el = document.createElement('style');
  el.id = RESET_STYLE_ID;
  el.textContent = BASE_RESET;
  document.head.insertBefore(el, document.head.firstChild);
}

// generateCss()'s result is a pure function of (classString, the active
// theme) — kb() is meant to be called on every render of a component using
// dynamic classes, though, so without this, the same className crossing the
// WASM boundary and getting fully re-resolved (and re-JSON.parsed) on every
// single render would be the norm, not the exception, for any component
// that calls kb() at all. injectRule() below is already a cheap no-op for a
// rule it's seen before, but reaching that point still required the full
// resolve first — this cache skips resolving at all on a repeat call.
// Cleared wholesale once it exceeds KB_CACHE_MAX, same bounded-not-evicted
// tradeoff `resolveStyle()`'s cache in @kbach/react-native's nativeBridge.ts
// makes, for the same reason: bounds memory for an app that builds many
// distinct/one-off class strings, at the cost of an occasional full miss.
const KB_CACHE_MAX = 500;
const kbCache = new Map<string, GenerateCssResult>();
// Reference, not content — getThemeJson() returns the SAME string instance
// until setTheme() reassigns it (see theme.ts), so comparing references is
// enough to detect "the theme changed since the cache was built" for free.
let cachedForThemeJson: string | null = null;
// The theme the engine actually gets: mode-aware colors as their
// `rgb(var(--kb-color-<name>))` variable (withColorVariables), the same form
// the static kbach.css uses. So `kb('bg-surface')` styles `.bg-surface`
// itself and returns it unchanged, rather than expanding it into per-mode
// classes the static CSS doesn't have. `hasModeAware` says whether the
// variables need injecting.
let engineThemeJson = '';
let hasModeAware = false;

function refreshEngineTheme(): void {
  const theme = getTheme();
  const withVars = withColorVariables(theme);
  hasModeAware = withVars !== theme;
  engineThemeJson = hasModeAware ? JSON.stringify(withVars) : getThemeJson();
}

// The class names the page's static kbach.css (from the Vite/PostCSS
// plugin) already defines. kb() leaves those to it: if a class's rules were
// in BOTH sheets, the runtime sheet (always later in the document) would win
// every tie, so a runtime `.grid` from one element beat the static
// `@media (min-width: 1024px) { .lg\:hidden }` on another, and responsive
// classes broke as soon as kb() ran. Recognized by the `--kb-dark-mode`
// declaration the plugin always writes on :root. Rebuilt when that sheet is
// replaced (dev-server hot update) or its rule count changes.
let staticOwner: Node | null = null;
let staticSheet: CSSStyleSheet | null = null;
let staticRuleCount = -1;
let staticTokens = new Set<string>();

function unescapeCssIdent(s: string): string {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, '$1');
}

function isStaticKbachSheet(sheet: CSSStyleSheet): boolean {
  try {
    return Array.from(sheet.cssRules).some((r) => r instanceof CSSStyleRule && r.selectorText === ':root' && r.cssText.includes('--kb-dark-mode'));
  } catch {
    return false; // a cross-origin stylesheet can't be read
  }
}

function collectClasses(rules: CSSRuleList, into: Set<string>): void {
  for (const r of Array.from(rules)) {
    if (r instanceof CSSStyleRule) {
      for (const m of r.selectorText.matchAll(/\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-])+)/g)) into.add(unescapeCssIdent(m[1]!));
    } else if ('cssRules' in r) {
      collectClasses((r as CSSGroupingRule).cssRules, into);
    }
  }
}

function staticClasses(): Set<string> {
  if (typeof document === 'undefined') return staticTokens;
  let sheet = staticOwner && (staticOwner as HTMLStyleElement).sheet;
  if (!sheet || !isStaticKbachSheet(sheet)) {
    sheet = Array.from(document.styleSheets).find((s) => s !== styleEl?.sheet && isStaticKbachSheet(s)) ?? null;
    staticOwner = sheet?.ownerNode ?? null;
  }
  if (!sheet) {
    staticSheet = null;
    staticTokens = new Set();
    return staticTokens;
  }
  if (sheet !== staticSheet || sheet.cssRules.length !== staticRuleCount) {
    staticSheet = sheet;
    staticRuleCount = sheet.cssRules.length;
    staticTokens = new Set();
    collectClasses(sheet.cssRules, staticTokens);
  }
  return staticTokens;
}

/**
 * Resolves a Kbach class string via the Rust/WASM engine, cascade-order-safe
 * injects the resulting CSS rules into a single `<style data-kbach>` tag,
 * and returns the class string to use as `className` (the input, except
 * for a mode-aware color whose values aren't hex, which the engine still
 * expands into per-mode classes).
 *
 * Classes the page's static kbach.css already defines are left to it (see
 * `staticClasses`), and mode-aware colors use the same CSS variables as the
 * static build (see `refreshEngineTheme`), so kb() and kbach.css agree.
 *
 * Must be called after `await initKbach()` resolves — see wasmLoader.ts.
 */
export function kb(classString: string): string {
  const themeJson = getThemeJson();
  if (themeJson !== cachedForThemeJson) {
    kbCache.clear();
    cachedForThemeJson = themeJson;
    refreshEngineTheme();
  }

  const statics = runtimeCSSDisabled ? null : staticClasses();
  let toResolve = classString;
  let alreadyStatic = '';
  if (statics && statics.size > 0) {
    const tokens = classString.split(/\s+/).filter(Boolean);
    toResolve = tokens.filter((t) => !statics.has(t)).join(' ');
    alreadyStatic = tokens.filter((t) => statics.has(t)).join(' ');
  }

  let result = kbCache.get(toResolve);
  if (result === undefined) {
    const json = generateCss(toResolve, engineThemeJson);
    result = JSON.parse(json) as GenerateCssResult;
    if (kbCache.size >= KB_CACHE_MAX) kbCache.clear();
    kbCache.set(toResolve, result);
  }

  const { className, rules } = result;
  if (!runtimeCSSDisabled) {
    ensureResetInjected();
    if (hasModeAware) ensureColorVariablesInjected(getTheme());
    for (const { rule, order } of rules) {
      injectRule(rule, order);
    }
  }
  return alreadyStatic ? (alreadyStatic + ' ' + className).trim() : className;
}

/** Exported for tests only — resets injected-rule tracking, the <style> tag, the reset tag, the disableRuntimeCSS() flag, and the resolved-className cache. */
export function _resetForTests(): void {
  sheetKeys.length = 0;
  ruleOrderByKey.clear();
  styleEl?.remove();
  styleEl = null;
  runtimeCSSDisabled = false;
  resetChecked = false;
  document.getElementById(RESET_STYLE_ID)?.remove();
  kbCache.clear();
  cachedForThemeJson = null;
  staticOwner = null;
  staticSheet = null;
  staticRuleCount = -1;
  staticTokens = new Set();
}
