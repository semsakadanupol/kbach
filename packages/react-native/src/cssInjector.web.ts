/**
 * Cascade-order-safe `<style>` rule injector for Expo Web's `[data-kb~="..."]`
 * attribute-selector CSS (see nativeBridge.web.ts's `resolveClassName`) — a
 * standalone port of @kbach/react's `kb.ts` injector, not an import of it:
 * this package deliberately doesn't depend on @kbach/react (a native-only
 * project shouldn't need to install a web-oriented package just for this),
 * same reasoning theme.ts's own doc comment gives for not importing
 * @kbach/react's ThemeConfig type. No reset-stylesheet concept here (unlike
 * kb.ts's `ensureResetInjected`) — react-native-web already normalizes
 * baseline styles itself, so there's nothing for this package to reset.
 */

let styleEl: HTMLStyleElement | null = null;

// Mirrors the live <style> sheet's rule order exactly — kept sorted by
// `order` at all times (a stable sort: same-order rules keep insertion
// order), so a rule's position — and therefore which same-specificity rule
// wins a cascade tie — depends on its registry-defined order, not on
// whichever resolveClassName() call happened to resolve it first.
const sheetKeys: string[] = [];
const ruleOrderByKey = new Map<string, number>();

function getStyleEl(): HTMLStyleElement {
  if (styleEl) return styleEl;
  styleEl = document.createElement('style');
  styleEl.setAttribute('data-kbach-rn', '');
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

export function injectRule(rule: string, order: number): void {
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
