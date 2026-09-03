/**
 * className-interception logic behind jsx-runtime.tsx — the NATIVE
 * (Android/iOS) entry only. Expo Web / react-native-web goes through
 * jsxRuntimeCoreWeb.ts instead (real CSS + `dataSet`, not a resolved
 * `style` object — genuinely different interception behavior, not just a
 * different resolve function, since real CSS selectors already react to a
 * DOM attribute change on their own with no React re-render involved at
 * all; see that file's own doc comment). See jsx-runtime.tsx's doc comment
 * for why native and web need to be separate entry files in the first
 * place (short version: @kbach/react-native ships pre-built dist/ output,
 * and Metro's `.web.js` platform-extension resolution only swaps between
 * two already-built sibling files, not source-level imports a single
 * tsup/esbuild build already flattened away).
 */
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Fragment, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import type { ReactElement } from 'react';
import type { LayoutChangeEvent, PressableStateCallbackType } from 'react-native';
import type { StyleObject } from './nativeBridge';
import { getGlobalDarkMode, subscribeGlobalDarkMode } from './darkModeStore';
import { getDynamicToken, subscribeDynamicTokens, getDynamicTokensVersion } from './dynamicTokens';
import { parsePercentRelativeExpr, type PercentRelativeExpr } from './layoutCalc';
import { splitRespectingBrackets } from './jsEngine/parser';

export { Fragment };
export type { JSX } from 'react';

export type ResolveStyleFn = (classString: string, pressed?: boolean) => StyleObject;

// Matches a bare `var(--token-name)` reference anywhere in a className —
// deliberately the SAME syntax real CSS custom properties use (not a
// Kbach-specific spelling), since Expo Web already resolves this exact
// text natively via real CSS with zero code here (see
// jsxRuntimeCoreWeb.ts's own doc comment); this is what gives native an
// equivalent for the same className, not a parallel dialect.
const DYNAMIC_TOKEN_MATCH_RE = /var\(--([a-zA-Z0-9-]+)\)/g;

/**
 * Substitutes every `var(--name)` occurrence in `classStrRaw` whose `name`
 * is currently registered via `setDynamicToken()` with its literal current
 * value, BEFORE the string ever reaches `resolveStyle()` — so from
 * resolveStyle's own perspective, `w-[var(--sidebar-width)]` is just an
 * ordinary arbitrary value like `w-[240px]` would be, reusing every
 * existing arbitrary-value code path (including the calc()/clamp()
 * reduction and invalid-value warning added alongside this) for free,
 * rather than needing its own separate resolution logic. An UNREGISTERED
 * token name is left untouched — it then falls through to the same
 * "not a valid native value" warning any other unresolvable arbitrary CSS
 * text already gets (see resolve_style.rs's own `rn_style_value` doc
 * comment), which is correct: a `var()` naming nothing this app ever set
 * genuinely isn't resolvable on native, same as it would be invalid CSS on
 * web if nothing ever defined that custom property either.
 */
function substituteDynamicTokens(classStrRaw: string): string {
  if (!classStrRaw.includes('var(--')) return classStrRaw;
  return classStrRaw.replace(DYNAMIC_TOKEN_MATCH_RE, (whole, name: string) => {
    const value = getDynamicToken(name);
    return value ?? whole;
  });
}

// Cheap pre-check before bothering to split+parse every token — matches
// the SHAPE parsePercentRelativeExpr actually accepts (w-[calc(...%...)]/
// h-[calc(...%...)], and now also w-[min(...%...)]/max(...)/clamp(...))
// closely enough to gate the more expensive per-token work in
// processElement's dispatch, without duplicating that function's own
// parsing logic. Deliberately `.*`, not `[^)]*`, between the parens — a
// nested paren (`w-[calc((100%/2)-10px)]`, now supported since
// layoutCalc.ts's evaluator understands `/` and nesting) contains a `)`
// of its own, which `[^)]*` can never match past regardless of
// backtracking — that silently disqualified every nested-paren token from
// this hint, so it never even reached the real parser at all. A false
// POSITIVE here only costs an extra parse attempt that correctly returns
// null; a false NEGATIVE silently drops a feature — so this errs toward
// matching too much, never too little.
const PERCENT_RELATIVE_CALC_HINT_RE = /[wh]-\[(calc|min|max|clamp)\(.*%.*\)\]/;

/** Every `w-[calc(...)]`/`h-[calc(...)]`/`w-[min(...)]`/`max(...)`/`clamp(...)` token in `classStrRaw` that resolves via `parsePercentRelativeExpr` — usually 0, at most 2 (one per property). */
function extractPercentRelativeCalcs(classStrRaw: string): PercentRelativeExpr[] {
  const found: PercentRelativeExpr[] = [];
  for (const token of classStrRaw.split(/\s+/)) {
    const parsed = parsePercentRelativeExpr(token);
    if (parsed) found.push(parsed);
  }
  return found;
}

/** Removes every token `extractPercentRelativeCalcs` would also match — these are handled entirely here (see `ReactiveElement`'s own `onLayout` handling) and must never reach `resolveStyle()`, which would otherwise drop them with a warning it has no way to know is being handled another way. */
function stripPercentRelativeCalcTokens(classStrRaw: string): string {
  return classStrRaw
    .split(/\s+/)
    .filter((token) => token && parsePercentRelativeExpr(token) === null)
    .join(' ');
}

// hover:/focus:/disabled:/data-[...]:/aria-[...]:/the static aria-*
// shortcuts — unlike dark:/active:/responsive, resolveStyle (the Rust
// engine and its JS-fallback port alike) has no parameter slot for these
// at all: its FFI signature (classString, themeJson, colorScheme, pressed,
// width) is fixed, and widening it would mean regenerating the JNI
// TurboModule spec AND rebuilding the committed Android .so binary — see
// README.md's "PREBUILT BINARY" section for why that's a separately
// fragile process this deliberately avoids touching. Instead, all of these
// are resolved entirely HERE, above resolveStyle: each qualifying token is
// rewritten (its own qualifying modifier names stripped from the chain)
// when every one currently holds, or dropped entirely when any doesn't —
// so resolveStyle only ever sees classes built from modifiers it already
// understands, the same "rewrite before it reaches resolveStyle" approach
// `substituteDynamicTokens` already uses for `var(--x)`.
//
// data-[...]:/aria-[...]:/the static aria-* shortcuts specifically read
// straight off the element's OWN props (`hostRest['data-key']`/
// `hostRest['aria-key']`) — no ReactiveElement wrapping needed for these
// EITHER, same reasoning `disabled:` already established: whatever passed
// this element its `aria-expanded`/`data-state` prop re-renders it
// naturally via ordinary React prop flow the moment that value changes, no
// extra subscription required. Real Tailwind's web equivalent matches a
// literal DOM attribute value via `[data-key="value"]`/`[aria-key="value"]`
// — the native counterpart here is the element's own prop of the same
// name, not a DOM attribute (RN has no DOM), which is as close an
// analogue as a flat props object can get.
const STATE_MODIFIER_NAMES = new Set(['hover', 'focus', 'disabled']);

// The 9 static aria-* shortcuts registry.rs's own static MODIFIERS table
// registers (`[aria-expanded="true"]` etc. on web) — kept in sync by hand
// with that table, same as every other web/native parity pairing in this
// file.
const STATIC_ARIA_SHORTCUT_NAMES = new Set([
  'aria-checked', 'aria-disabled', 'aria-expanded', 'aria-hidden',
  'aria-pressed', 'aria-readonly', 'aria-required', 'aria-selected', 'aria-busy',
]);

interface ElementStates {
  hover: boolean;
  focus: boolean;
  disabled: boolean;
}

// Cheap pre-check, same shape/purpose as PERCENT_RELATIVE_CALC_HINT_RE —
// gates the more expensive per-token splitRespectingBrackets work below.
// `(^|\s|:)` — a modifier can be preceded by the start of a token, a space
// (start of a NEW token), OR another modifier's own trailing ":" (chained,
// e.g. "sm:dark:bg-red-6" or "hover:focus:bg-red-6") — not just `(^|\s)`,
// which only catches a modifier written FIRST in its chain and silently
// misses it whenever something else precedes it. Confirmed as a real,
// reproducible gap (not a hypothetical): `/(^|\s)dark:/.test("sm:dark:bg-
// red-6")` is `false`, meaning that element would never get wrapped in
// ReactiveElement and its color would silently freeze on a dark-mode
// toggle — exactly the historical symptom this whole file's reactivity
// mechanism exists to prevent, just triggered by chain ORDER instead of a
// missing subscription. Applies to every one of this file's own modifier-
// presence regexes below, not just the state ones. `data-\[`/`aria-\[`
// deliberately don't try to match their own closing `]:` here — the
// bracket content can contain almost anything (colons included, e.g.
// `data-[state=open]:`), so this only checks the opening shape is present
// SOMEWHERE and lets the real per-token parse below sort out the rest; a
// false positive here just costs one wasted split, never a wrong result.
const STATE_MODIFIER_HINT_RE =
  /(^|\s|:)(hover|focus|disabled|aria-checked|aria-disabled|aria-expanded|aria-hidden|aria-pressed|aria-readonly|aria-required|aria-selected|aria-busy):|data-\[|aria-\[/;

/** Strips `prefix` then a `[...]` bracket pair — same shape as registry.rs's own `bracket_content`, ported here for `data-[...]`/`aria-[...]` parsing. */
function bracketContent(name: string, prefix: string): string | null {
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  if (!rest.startsWith('[') || !rest.endsWith(']')) return null;
  return rest.slice(1, -1);
}

/** `key=value` (or a bare `key`) inner content -> whether that condition currently holds against `hostRest`'s own prop of the same name — `data-[state=open]` reads `hostRest['data-state']`, `aria-[expanded=true]` reads `hostRest['aria-expanded']`. A bare key (no "="): truthy-presence check. With a value: string-compared, since the value as written in the class name is always text. */
function evalAttrCondition(hostRest: Record<string, unknown>, attrPrefix: string, inner: string): boolean {
  const eqIdx = inner.indexOf('=');
  if (eqIdx === -1) return Boolean(hostRest[`${attrPrefix}${inner}`]);
  const key = inner.slice(0, eqIdx);
  const value = inner.slice(eqIdx + 1);
  return String(hostRest[`${attrPrefix}${key}`]) === value;
}

/** Real boolean `true`, or (an aria-/data- prop sometimes arrives as a plain string rather than a real boolean) the literal string `"true"` — either counts as "yes" for a static aria-* shortcut. */
function isAriaTruthy(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Resolves ONE modifier name's current truth for the "reads from this
 * element's own state/props" family this file handles above resolveStyle
 * — `null` for anything else (an ancestor/sibling/media modifier this
 * function has no opinion on, left for `resolveStyle` itself to handle or
 * not).
 */
function propBasedModifierState(name: string, states: ElementStates, hostRest: Record<string, unknown>): boolean | null {
  if (STATE_MODIFIER_NAMES.has(name)) return states[name as keyof ElementStates];
  if (STATIC_ARIA_SHORTCUT_NAMES.has(name)) return isAriaTruthy(hostRest[name]);
  const dataInner = bracketContent(name, 'data-');
  if (dataInner !== null) return evalAttrCondition(hostRest, 'data-', dataInner);
  const ariaInner = bracketContent(name, 'aria-');
  if (ariaInner !== null) return evalAttrCondition(hostRest, 'aria-', ariaInner);
  return null;
}

/** Strips every name in `namesToStrip` from an already-split `[...modifiers, utility]` array (see `splitRespectingBrackets`), leaving the utility part and every other modifier untouched. Takes the pre-split parts rather than re-splitting the token itself — `substituteStateModifiers` (the only caller) already has them from its own presence check, and re-parsing the same token twice per call is wasted work on every render. */
function stripModifiers(parts: string[], namesToStrip: Set<string>): string {
  const utility = parts[parts.length - 1] ?? '';
  const modifiers = parts.slice(0, -1).filter((m) => !namesToStrip.has(m));
  return [...modifiers, utility].join(':');
}

/**
 * For each whitespace-separated token in `classStrRaw`: if it uses one or
 * more of hover:/focus:/disabled:/data-[...]:/aria-[...]:/the static aria-*
 * shortcuts, it's kept (with those specific modifiers stripped from its
 * chain) only when EVERY one it names currently holds — dropped entirely
 * otherwise, since RN's flat style object has no cascade to let an
 * unapplied rule simply lose a specificity fight the way CSS would. A
 * token using none of these passes through unchanged.
 *
 * Token ORDER is preserved (never reordered, only filtered) — this matters
 * because `resolveStyle` merges same-property declarations last-token-wins,
 * by the order they appear in the string it receives (same rule dark:/sm:/
 * active: already live under; this doesn't introduce a new merge rule, it's
 * the first time these modifiers get to participate in it, since they were
 * simply inert before this file supported them at all). Writing the base
 * class before its state variant — `"bg-red-6 hover:bg-blue-6"`, the
 * conventional order — resolves correctly once hovered (hover's color
 * comes second, so it wins); writing it the other way around inverts that.
 * This is the existing convention every other modifier here already
 * depends on, not a hover/focus-specific quirk.
 */
function substituteStateModifiers(classStrRaw: string, states: ElementStates, hostRest: Record<string, unknown>): string {
  if (!STATE_MODIFIER_HINT_RE.test(classStrRaw)) return classStrRaw;
  const kept: string[] = [];
  for (const token of classStrRaw.split(/\s+/)) {
    if (!token) continue;
    const parts = splitRespectingBrackets(token);
    const modifiers = parts.slice(0, -1);
    const resolved = modifiers.map((m) => [m, propBasedModifierState(m, states, hostRest)] as const);
    const required = resolved.filter(([, v]) => v !== null);
    if (required.length === 0) {
      kept.push(token);
      continue;
    }
    if (required.every(([, v]) => v === true)) {
      const requiredNames = new Set(required.map(([m]) => m));
      kept.push(stripModifiers(parts, requiredNames));
    }
  }
  return kept.join(' ');
}

function makeElement(
  isStaticChildren: boolean,
  type: unknown,
  props: Record<string, unknown>,
  key: string | undefined,
): ReactElement {
  return (isStaticChildren ? _jsxs : _jsx)(type as any, props as any, key) as ReactElement;
}

/**
 * Resolves `classStrRaw` for a given press state and merges in `userStyle`.
 * `layoutOverrides` (only ever non-empty for a `w-[calc(...%...)]`/
 * `h-[calc(...%...)]` token — see `ReactiveElement`'s own `onLayout`
 * handling) is merged in AFTER the normal resolve, taking precedence —
 * those specific tokens are stripped out before `resolveStyle` ever sees
 * them (see `stripPercentRelativeCalcTokens`), so there's nothing to
 * collide with regardless, this is just where the computed value lands.
 *
 * `states` (hover/focus/disabled) defaults to `{ hover: false, focus:
 * false, disabled: false }` when omitted — every caller still passes a
 * real value for `disabled` (read straight off the element's own `disabled`
 * prop, already reactive via ordinary prop flow with no extra wrapping
 * needed), but `hover`/`focus` are only ever tracked by `ReactiveElement`,
 * so the plain (non-reactive) call site below has no live value for them
 * and correctly treats a `hover:`/`focus:`-qualified class as never-active
 * rather than always-active — see `processElement`'s own routing check for
 * why an element using either one is never routed through the plain path
 * to begin with. `hostRest` is this element's own OTHER props (everything
 * but `className`/`style`) — read fresh on every call for
 * `data-[...]:`/`aria-[...]:`/the static aria-* shortcuts, same "always
 * live via ordinary prop flow" reasoning `disabled` already relies on.
 */
function resolvedStyleFor(
  resolveStyle: ResolveStyleFn,
  classStrRaw: string,
  userStyle: unknown,
  pressed: boolean,
  hostRest: Record<string, unknown>,
  layoutOverrides?: Record<string, number | string>,
  states: ElementStates = { hover: false, focus: false, disabled: false },
): unknown {
  const stateResolved = substituteStateModifiers(classStrRaw, states, hostRest);
  const cleaned = stripPercentRelativeCalcTokens(substituteDynamicTokens(stateResolved));
  const resolved = resolveStyle(cleaned, pressed) as Record<string, unknown>;
  if (layoutOverrides) {
    Object.assign(resolved, layoutOverrides);
  }
  if (userStyle === undefined) {
    return resolved;
  }
  if (typeof userStyle === 'function') {
    return [resolved, (userStyle as (state: PressableStateCallbackType) => unknown)({ pressed })];
  }
  return [resolved, userStyle];
}

// See STATE_MODIFIER_HINT_RE's own doc comment above for why these all use
// `(^|\s|:)`, not just `(^|\s)` — a modifier chained after another one
// (e.g. "sm:dark:", "hover:focus:") is otherwise silently missed.
const DARK_MODIFIER_RE = /(^|\s|:)dark:/;
// Named breakpoints (sm/md/lg/.../2xl) OR an arbitrary min-[...]:/max-[...]:
// — both need this element to re-render on a width change (rotation,
// split-screen, ...), same as dark: needs a re-render on a theme change.
// Missing the arbitrary form here would be a real, silent bug: the class
// would still resolve correctly once (nativeModifierState/
// native_modifier_state both understand it now), just never react to a
// LATER width change, since it'd never get wrapped in ReactiveElement at
// all to begin with.
const BREAKPOINT_MODIFIER_RE = /(^|\s|:)(sm|md|lg|xl|2xl):|(^|\s|:)(min|max)-\[[^\]]*\]:/;
const HOVER_MODIFIER_RE = /(^|\s|:)hover:/;
const FOCUS_MODIFIER_RE = /(^|\s|:)focus:/;

interface ReactiveProps {
  hostType: unknown;
  hostRest: Record<string, unknown>;
  classStrRaw: string;
  userStyle: unknown;
  resolveStyle: ResolveStyleFn;
  elementKey: string | undefined;
  isStaticChildren: boolean;
}

/**
 * A `dark:`- or responsive-breakpoint-bearing element gets wrapped in this
 * tiny component instead of being emitted as a plain host element directly.
 * `jsx()`/`jsxs()` are plain functions invoked synchronously as part of
 * whatever OTHER component's render body wrote the JSX — they can't call
 * hooks themselves (they run conditionally/in loops along with the
 * surrounding JSX, which would violate the rules of hooks), so on their own
 * they only ever read `getGlobalDarkMode()`/the window width once, at
 * whatever moment that surrounding component happened to render. If nothing
 * in the tree ever calls `useTheme()`/`useWindowDimensions()` (or otherwise
 * subscribes) near enough to this element to force it to render again — the
 * common case, since `<ThemeProvider>` itself deliberately doesn't
 * subscribe (see its own doc comment) and most screens never call either
 * hook at all — this element's colors/layout would silently freeze at
 * whatever they were on first mount, never reacting to a theme change or a
 * device rotation/resize again.
 *
 * This component fixes that by subscribing to darkModeStore, dynamicTokens
 * (both via `useSyncExternalStore`), and `useWindowDimensions()` itself —
 * a REAL React component can call hooks, so this one re-renders on every
 * dark-mode, dynamic-token, or dimension change independent of what any
 * ancestor does, recomputing `finalStyle` fresh each time and passing it
 * down as an ordinary prop on the SAME host element instance (same `key`
 * as ever — see `elementKey` below). That's deliberately no different from
 * how any other prop-driven style update works in React Native (e.g. an
 * `Animated`/`Reanimated` value, or a `useState`-backed style toggled from
 * a button press) — ordinary reconciliation re-applies a changed `style`
 * prop to an already-mounted host component without remounting it, and
 * there's nothing dark-mode/breakpoint/token-specific that would make this
 * one case different. (An earlier version of this file forced a full
 * remount on every one of these changes via a synthetic `key` suffix, on
 * the theory that RN's reconciler needed one to repaint at all — removed
 * once it became clear the actual bug across all those "dark: still stale"
 * commits was upstream, in the darkModeStore/dynamicTokens subscriptions
 * themselves not firing at all in various builds, not in what happened
 * once they did fire. See git blame around 2026-08 for the removal if
 * that theory turns out to be wrong on a real device — the four key-suffix
 * helpers this used to call are gone, not merely dead code.) All three
 * store subscriptions are made unconditionally regardless of which
 * modifier(s)/token(s) the className actually uses — cheap, and keeps this
 * component's hook list fixed across renders.
 *
 * `w-[calc(...%...)]`/`h-[calc(...%...)]` — and now `min()`/`max()`/
 * `clamp()` with at least one percentage argument too (see layoutCalc.ts's
 * `parsePercentRelativeExpr`) — work differently from the other three:
 * there's no external store to subscribe to at all — the "current value"
 * IS this element's own layout,
 * which nothing knows ahead of time. `measuredBasis` (component-local
 * state, not a global store) tracks it: the FIRST render sets the
 * property to a plain `'100%'` — a real RN percentage RN's own layout
 * engine resolves correctly against the parent — purely to get an
 * `onLayout` event at all; once that fires, `measuredBasis` updates with
 * the real pixel size, and a second render computes the actual
 * `resolvePercentRelativeCalc` answer as a plain number. That's a genuine
 * measure-then-snap (briefly renders at `100%` before correcting) — there
 * is no way to know "100% of the parent" without asking RN to lay
 * something out first, same reason resolve_style.rs's constant-only
 * reducer can't handle this case at all. Re-probes on a genuine window-size
 * change (rotation, split-screen, ...) — NOT on every `onLayout` call: once
 * the computed pixel value is applied, that's itself a real layout change
 * from the `'100%'` probe render, so RN fires `onLayout` again reporting
 * it; treating that as a fresh basis would feed the already-corrected size
 * back into `resolvePercentRelativeCalc` as if it were 100% of the parent,
 * compounding smaller (or, for a percentage coefficient of exactly 100,
 * drifting without bound) on every subsequent render instead of settling
 * once. See `measure`'s own doc comment below for the guard that prevents
 * this.
 */
function ReactiveElement({
  hostType,
  hostRest,
  classStrRaw,
  userStyle,
  resolveStyle,
  elementKey,
  isStaticChildren,
}: ReactiveProps): ReactElement {
  useSyncExternalStore(subscribeGlobalDarkMode, getGlobalDarkMode);
  useSyncExternalStore(subscribeDynamicTokens, getDynamicTokensVersion);
  // The actual width value (not just the subscription) is needed now — see
  // the windowSize-reset logic below — whereas every OTHER consumer of
  // resolveStyle/resolvedStyleFor still reads width fresh via nativeBridge's
  // own width parameter, not from here.
  const windowSize = useWindowDimensions();

  const [measuredBasis, setMeasuredBasis] = useState<{ width: number; height: number } | null>(null);
  // Detects a genuine external resize (rotation, split-screen, ...) during
  // render and resets measuredBasis to null so the next render re-probes at
  // '100%' — the ONLY trustworthy way to learn the parent's current size,
  // same reasoning the mount-time probe below already relies on. Comparing
  // a ref against the current windowSize (React's own documented pattern
  // for "adjust state when a prop/value changes without an extra effect
  // frame") rather than a useEffect: this must take effect before the
  // stale `measure` guard below gets a chance to ignore the next onLayout,
  // and an effect would commit the stale layoutOverrides for one extra
  // frame first.
  const lastWindowSizeRef = useRef(windowSize);
  if (lastWindowSizeRef.current.width !== windowSize.width || lastWindowSizeRef.current.height !== windowSize.height) {
    lastWindowSizeRef.current = windowSize;
    if (measuredBasis !== null) {
      setMeasuredBasis(null);
    }
  }
  const measure = useCallback((e: LayoutChangeEvent) => {
    // Only the FIRST onLayout after each reset (mount, or the windowSize
    // reset above) is a real measurement of the parent — every SUBSEQUENT
    // onLayout for this same element is self-caused: applying the computed
    // absolute pixel value below is itself a genuine layout change from the
    // '100%' probe render, so RN fires onLayout again reporting that new
    // (already-correct) size. The naive version of this callback used to
    // accept that as a new basis and recompute `calc.resolve()` against it
    // — e.g. a 390px parent probes to 342 (100%-3rem), which itself then
    // gets treated as the new "100%" and recomputed to 294, then 246, then
    // 198, ... visibly shrinking every frame instead of settling once (see
    // jsx-runtime.test.ts's regression test for this exact scenario, and
    // never converges at all for a percentCoefficient of exactly 100).
    // Ignoring every onLayout past the first means an explicit pixel width
    // genuinely won't react to a parent resize that ISN'T accompanied by a
    // window-dimension change (e.g. a sibling toggling visibility) — a real,
    // narrower scope than before, but correctness beats that lost coverage.
    const { width: w, height: h } = e.nativeEvent.layout;
    setMeasuredBasis((prev) => (prev === null ? { width: w, height: h } : prev));
  }, []);

  // hover:/focus: — see `substituteStateModifiers`'s own doc comment for
  // why these are tracked as plain local state here instead of threading
  // through resolveStyle itself. Always called (rules of hooks — same
  // "cheap, keeps this component's hook list fixed across renders"
  // reasoning the three store subscriptions above already use), but the
  // actual event-prop wiring below is scoped to elements whose className
  // literally uses hover:/focus: respectively, same as every other
  // conditional prop this component adds.
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const percentCalcs = extractPercentRelativeCalcs(classStrRaw);
  let layoutOverrides: Record<string, number | string> | undefined;
  let hostRestWithLayout = hostRest;
  if (percentCalcs.length > 0) {
    layoutOverrides = {};
    for (const calc of percentCalcs) {
      const basis = measuredBasis?.[calc.property];
      layoutOverrides[calc.property] = basis === undefined ? '100%' : calc.resolve(basis);
    }
    // Compose with the caller's own onLayout (if any) rather than silently
    // replacing it — this is the one place ReactiveElement adds a prop
    // beyond `style`/`key`, so it's the one place a collision is possible.
    const userOnLayout = hostRest.onLayout as ((e: LayoutChangeEvent) => void) | undefined;
    hostRestWithLayout = {
      ...hostRest,
      onLayout: userOnLayout
        ? (e: LayoutChangeEvent) => {
            measure(e);
            userOnLayout(e);
          }
        : measure,
    };
  }

  // `onHoverIn`/`onHoverOut` are Pressable-specific in RN's own type
  // surface (pointer support on iOS/Android/macOS/Windows — no-op on a
  // touch-only device with no pointer, same as real Tailwind's `hover:`
  // already correctly resolving to nothing on a touch-only browser via
  // `@media (hover: hover)` — RN just has no such media-query gate, so it
  // literally never fires instead), but composing them onto ANY host type
  // is harmless: RN components silently ignore props they don't destructure,
  // there being no real DOM underneath to warn about an unrecognized
  // attribute. Composed with the caller's own handlers, same as onLayout.
  if (HOVER_MODIFIER_RE.test(classStrRaw)) {
    const userOnHoverIn = hostRestWithLayout.onHoverIn as ((e: unknown) => void) | undefined;
    const userOnHoverOut = hostRestWithLayout.onHoverOut as ((e: unknown) => void) | undefined;
    hostRestWithLayout = {
      ...hostRestWithLayout,
      onHoverIn: (e: unknown) => {
        setIsHovered(true);
        userOnHoverIn?.(e);
      },
      onHoverOut: (e: unknown) => {
        setIsHovered(false);
        userOnHoverOut?.(e);
      },
    };
  }
  if (FOCUS_MODIFIER_RE.test(classStrRaw)) {
    const userOnFocus = hostRestWithLayout.onFocus as ((e: unknown) => void) | undefined;
    const userOnBlur = hostRestWithLayout.onBlur as ((e: unknown) => void) | undefined;
    hostRestWithLayout = {
      ...hostRestWithLayout,
      onFocus: (e: unknown) => {
        setIsFocused(true);
        userOnFocus?.(e);
      },
      onBlur: (e: unknown) => {
        setIsFocused(false);
        userOnBlur?.(e);
      },
    };
  }

  const states: ElementStates = { hover: isHovered, focus: isFocused, disabled: hostRest.disabled === true };

  const finalStyle =
    hostType === Pressable
      ? (state: PressableStateCallbackType) =>
          resolvedStyleFor(resolveStyle, classStrRaw, userStyle, state.pressed, hostRest, layoutOverrides, states)
      : resolvedStyleFor(resolveStyle, classStrRaw, userStyle, false, hostRest, layoutOverrides, states);

  // className is put back on the props alongside the computed style — see
  // processElement's own doc comment on this same pattern for why.
  return makeElement(
    isStaticChildren,
    hostType,
    { ...hostRestWithLayout, className: classStrRaw, style: finalStyle },
    elementKey,
  );
}

function processElement(
  resolveStyle: ResolveStyleFn,
  type: unknown,
  rawProps: Record<string, unknown> | null,
  key: string | undefined,
  isStaticChildren: boolean,
): ReactElement {
  if (type === null || typeof type === 'symbol' || !rawProps) {
    return makeElement(isStaticChildren, type, rawProps ?? {}, key);
  }

  const { className: classStrRaw, style: userStyle, ...rest } = rawProps;

  // Not a plain string (undefined, or a function-valued className some
  // third-party component might use its own way) — not ours to resolve.
  if (typeof classStrRaw !== 'string') {
    return makeElement(isStaticChildren, type, rawProps, key);
  }

  // `type` here can be a REAL RN host primitive (View, Text, Pressable, an
  // Animated.* wrapper, ...) or a plain component YOU wrote — jsx()/jsxs()
  // can't tell those apart (RN host components are real component
  // references here, not plain strings the way "div" is on the web, so
  // there's no cheap typeof check that would draw the line). Rather than
  // guess, `className` is put back on the outgoing props below ALONGSIDE
  // the computed `style` — a host primitive already gets everything it
  // needs from `style` and silently ignores the extra unrecognized
  // `className` prop (RN's native view managers never error on a prop
  // they don't declare), while a custom component like `<PrimaryBg
  // className="...">` now genuinely receives `className` again, exactly
  // as its own props type expects — no manual `style`-forwarding required
  // just to make a caller's className reach the component at all.

  if (
    DARK_MODIFIER_RE.test(classStrRaw) ||
    BREAKPOINT_MODIFIER_RE.test(classStrRaw) ||
    HOVER_MODIFIER_RE.test(classStrRaw) ||
    FOCUS_MODIFIER_RE.test(classStrRaw) ||
    classStrRaw.includes('var(--') ||
    PERCENT_RELATIVE_CALC_HINT_RE.test(classStrRaw)
  ) {
    return _jsx(
      ReactiveElement,
      { hostType: type, hostRest: rest, classStrRaw, userStyle, resolveStyle, elementKey: key, isStaticChildren },
      key,
    ) as ReactElement;
  }

  // No hover:/focus: to track reactively, so `disabled` is read directly
  // off the prop the caller already passed — see `resolvedStyleFor`'s own
  // doc comment for why that alone is enough for it to react correctly to
  // a later prop change, with no ReactiveElement wrapping needed.
  const staticStates: ElementStates = { hover: false, focus: false, disabled: rest.disabled === true };

  // Pressable is the one component that knows press state at all — style
  // becomes a function so active: can react to it. Every other type keeps
  // the plain, static resolution it always had (pressed is always false).
  const finalStyle =
    type === Pressable
      ? (state: PressableStateCallbackType) => resolvedStyleFor(resolveStyle, classStrRaw, userStyle, state.pressed, rest, undefined, staticStates)
      : resolvedStyleFor(resolveStyle, classStrRaw, userStyle, false, rest, undefined, staticStates);

  return makeElement(isStaticChildren, type, { ...rest, className: classStrRaw, style: finalStyle }, key);
}

/**
 * `active:` needs different handling from every other modifier: whether an
 * element is "pressed" isn't a value that can be read once and reused like
 * `dark:`'s color scheme — only RN's `Pressable` ever knows it, and only
 * via a style FUNCTION it calls on every press/release
 * (`style={({pressed}) => ...}`). So for `type === Pressable` specifically,
 * `style` is built as a function instead of a static value; every other
 * element type is completely unaffected by this — same code path as before.
 */
export function createJsxFunctions(resolveStyle: ResolveStyleFn) {
  function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
    return processElement(resolveStyle, type, props, key, false);
  }

  function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
    return processElement(resolveStyle, type, props, key, true);
  }

  return { jsx, jsxs };
}

/**
 * Shared jsxDEV behavior behind jsx-dev-runtime.tsx/jsx-dev-runtime.web.tsx
 * — Metro calls jsxDEV instead of jsx/jsxs in dev builds. Reuses whichever
 * platform's jsx/jsxs pair is passed in for the actual interception, then
 * patches _source/_self onto the result so React DevTools shows the
 * original file/line.
 */
type JsxFn = (type: unknown, props: Record<string, unknown> | null, key?: string) => ReactElement;

export function createJsxDEV(jsx: JsxFn, jsxs: JsxFn) {
  return function jsxDEV(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string,
    isStaticChildren?: boolean,
    source?: { fileName: string; lineNumber: number; columnNumber: number },
    self?: unknown,
  ): ReactElement {
    const element = (isStaticChildren ? jsxs : jsx)(type, props, key);

    // React's dev JSX runtime freezes the returned element (and no longer
    // even defines _source/_self as of React 19) — only patch when the
    // object is still extensible. Same React-19 compatibility note as
    // @kbach/react/jsx-dev-runtime.
    if (source && element && typeof element === 'object' && Object.isExtensible(element)) {
      (element as any)._source = source;
      (element as any)._self = self;
    }

    return element;
  };
}
