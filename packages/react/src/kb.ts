import { generateCss } from './wasmLoader';
import { getThemeJson } from './theme';
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

// When a static kbach.css (see vite-plugin/index.ts) already provides these
// rules, runtime injection is redundant — call disableRuntimeCSS() once at
// startup to skip it. Does NOT skip calling into the WASM engine, though:
// kb() still needs generate_css's returned className for mode-aware-color
// expansion, since the static file's selectors are generated against that
// expanded text too. Only the sheet.insertRule side effect is skipped.
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

/**
 * Resolves a Kbach class string via the Rust/WASM engine, cascade-order-safe
 * injects the resulting CSS rules into a single `<style data-kbach>` tag,
 * and returns the class string unchanged for use as `className`.
 *
 * Must be called after `await initKbach()` resolves — see wasmLoader.ts.
 */
export function kb(classString: string): string {
  const json = generateCss(classString, getThemeJson());
  const { className, rules } = JSON.parse(json) as GenerateCssResult;
  if (!runtimeCSSDisabled) {
    ensureResetInjected();
    for (const { rule, order } of rules) {
      injectRule(rule, order);
    }
  }
  return className;
}

/** Exported for tests only — resets injected-rule tracking, the <style> tag, the reset tag, and the disableRuntimeCSS() flag. */
export function _resetForTests(): void {
  sheetKeys.length = 0;
  ruleOrderByKey.clear();
  styleEl?.remove();
  styleEl = null;
  runtimeCSSDisabled = false;
  resetChecked = false;
  document.getElementById(RESET_STYLE_ID)?.remove();
}
