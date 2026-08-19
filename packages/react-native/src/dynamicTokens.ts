/**
 * Cross-platform runtime-settable style values — the native counterpart to
 * a real CSS custom property. Real `var(--sidebar-width)` already works on
 * Expo Web today with ZERO code here (raw CSS text, resolved by the
 * browser's own engine — see `jsxRuntimeCoreWeb.ts`, which does no
 * className rewriting at all). Native has no such thing: RN's style system
 * needs an actual JS-computed value at render time, so this module exists
 * to give `var(--x)` an equivalent that works there too — same
 * "module-level store is the real source of truth, no Context required"
 * architecture as `darkModeStore.ts`, and `setDynamicToken` ALSO writes the
 * real CSS custom property to the DOM when one exists (mirroring that
 * file's own `applyToDom`), so a single call updates both platforms
 * identically: instantly via native CSS reactivity on web, via this
 * store's subscribers (see `jsxRuntimeCore.ts`'s `ReactiveElement`, which
 * substitutes a registered token's current value into the className
 * string before every resolve) on native.
 *
 * Deliberately ONE listener set shared by every token, not per-token
 * subscriptions — same trade-off `darkModeStore.ts` already makes for
 * "any relevant change re-renders every subscribed element" simplicity.
 * `jsxRuntimeCore.ts`'s own key-suffix scoping (only the SPECIFIC token
 * names a given className references) is what keeps an unrelated token
 * change from forcing an unnecessary remount on an element that doesn't
 * use it, same shape as the responsive-breakpoint scoping already does.
 */

const tokens = new Map<string, string>();
const listeners = new Set<() => void>();
// A single scalar useSyncExternalStore can watch for identity changes —
// there's no one "the current value" across an open-ended set of token
// names the way darkModeStore has `isDark`, so this increments on every
// set/delete instead; see `getDynamicTokensVersion`/jsxRuntimeCore.ts's
// ReactiveElement, which subscribes to this rather than any one token.
let version = 0;

function applyToDom(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(`--${name}`, value);
}

function notify(): void {
  version++;
  for (const listener of listeners) listener();
}

/** `name` is the bare token name, WITHOUT the leading `--` (matching how `getDynamicToken`/`var(--name)` substitution both address it). */
export function setDynamicToken(name: string, value: string): void {
  tokens.set(name, value);
  applyToDom(name, value);
  notify();
}

export function getDynamicToken(name: string): string | undefined {
  return tokens.get(name);
}

export function deleteDynamicToken(name: string): void {
  if (!tokens.delete(name)) return;
  if (typeof document !== 'undefined') document.documentElement.style.removeProperty(`--${name}`);
  notify();
}

export function subscribeDynamicTokens(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDynamicTokensVersion(): number {
  return version;
}

/** Exported for tests only — resets every module-level field back to its as-if-just-imported state. */
export function _resetForTests(): void {
  tokens.clear();
  listeners.clear();
  version = 0;
}
