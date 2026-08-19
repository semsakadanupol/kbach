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
import { Fragment, useSyncExternalStore } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import type { ReactElement } from 'react';
import type { PressableStateCallbackType } from 'react-native';
import type { StyleObject } from './nativeBridge';
import { getGlobalDarkMode, subscribeGlobalDarkMode } from './darkModeStore';
import { getDynamicToken, subscribeDynamicTokens, getDynamicTokensVersion } from './dynamicTokens';
import { getTheme } from './theme';

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

function makeElement(
  isStaticChildren: boolean,
  type: unknown,
  props: Record<string, unknown>,
  key: string | undefined,
): ReactElement {
  return (isStaticChildren ? _jsxs : _jsx)(type as any, props as any, key) as ReactElement;
}

/** Resolves `classStrRaw` for a given press state and merges in `userStyle`. */
function resolvedStyleFor(resolveStyle: ResolveStyleFn, classStrRaw: string, userStyle: unknown, pressed: boolean): unknown {
  const resolved = resolveStyle(substituteDynamicTokens(classStrRaw), pressed);
  if (userStyle === undefined) {
    return resolved;
  }
  if (typeof userStyle === 'function') {
    return [resolved, (userStyle as (state: PressableStateCallbackType) => unknown)({ pressed })];
  }
  return [resolved, userStyle];
}

const DARK_MODIFIER_RE = /(^|\s)dark:/;
const BREAKPOINT_MODIFIER_RE = /(^|\s)(sm|md|lg|xl|2xl):/;
// Same set as BREAKPOINT_MODIFIER_RE, used to enumerate which specific
// breakpoint(s) a className references (see breakpointKeySuffix).
const BREAKPOINT_MODIFIER_MATCH_RE = /(?:^|\s)(sm|md|lg|xl|2xl):/g;

/**
 * A `dark:`-bearing element needs a key suffix that changes whenever the
 * global dark-mode state does — confirmed by hand against a real Expo Go
 * app: React Native's own reconciler doesn't reliably repaint an
 * ALREADY-MOUNTED host component (View/Text/Pressable) just because its
 * `style` prop holds new VALUES; forcing a remount via a changed `key` is
 * what actually made the new colors show. Scoped to elements whose
 * className literally contains "dark:" (a cheap regex test) rather than
 * applied unconditionally, so an element with no mode-dependent styling
 * never remounts for no reason.
 */
function darkModeKeySuffix(classStrRaw: string): string {
  return DARK_MODIFIER_RE.test(classStrRaw) ? `:kb-dark-${getGlobalDarkMode()}` : '';
}

/**
 * `sm:`/`md:`/`lg:`/`xl:`/`2xl:` have the identical "already-mounted host
 * component doesn't repaint on a new style VALUE" issue dark: has (same "a
 * live JS parameter, no React state, no built-in re-render-triggers-repaint
 * guarantee" shape — see nativeBridge.ts's own width parameter doc
 * comment), confirmed by the same ReactiveElement design fixing it there.
 * Reduces the live `width` to just the breakpoint(s) this particular
 * className actually references (rather than the raw pixel width) so a
 * resize/rotation that doesn't cross any breakpoint THIS element cares
 * about never triggers a remount — e.g. an `md:` element ignores an `sm`
 * crossing entirely.
 */
function breakpointKeySuffix(classStrRaw: string, width: number): string {
  const matches = classStrRaw.match(BREAKPOINT_MODIFIER_MATCH_RE);
  if (!matches) {
    return '';
  }
  const screens = getTheme().screens;
  const present = Array.from(new Set(matches.map((m) => m.trim().slice(0, -1))));
  const state = present.map((name) => (screens[name] !== undefined && width >= screens[name] ? '1' : '0')).join('');
  return `:kb-bp-${state}`;
}

/**
 * Same "already-mounted host component doesn't repaint on a new style
 * VALUE" issue dark:/breakpoints have, for `var(--token)` references —
 * `substituteDynamicTokens` already makes `resolveStyle` see the CURRENT
 * value on every call, but nothing forces a REPAINT of an existing element
 * when only the token changed and no ancestor re-rendered. Reduces to just
 * the current values of the SPECIFIC token(s) this className references
 * (not the store's global version counter) so a different, unrelated
 * token's change never remounts an element that doesn't use it.
 */
function dynamicTokenKeySuffix(classStrRaw: string): string {
  const matches = classStrRaw.match(DYNAMIC_TOKEN_MATCH_RE);
  if (!matches) return '';
  const values = matches.map((m) => getDynamicToken(m.slice('var(--'.length, -1)) ?? '');
  return `:kb-dt-${values.join('|')}`;
}

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
 * ancestor does, recomputing the resolved style and the forced-remount key
 * (darkModeKeySuffix + breakpointKeySuffix + dynamicTokenKeySuffix) fresh
 * each time. All three hooks are called unconditionally regardless of
 * which modifier(s)/token(s) the className actually uses — cheap, and
 * keeps this component's hook list fixed across renders; the key suffix
 * helpers are what scope the actual remount behavior.
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
  const { width } = useWindowDimensions();

  const finalStyle =
    hostType === Pressable
      ? (state: PressableStateCallbackType) => resolvedStyleFor(resolveStyle, classStrRaw, userStyle, state.pressed)
      : resolvedStyleFor(resolveStyle, classStrRaw, userStyle, false);

  const suffix = darkModeKeySuffix(classStrRaw) + breakpointKeySuffix(classStrRaw, width) + dynamicTokenKeySuffix(classStrRaw);
  const finalKey = suffix ? `${elementKey ?? ''}${suffix}` : elementKey;

  return makeElement(isStaticChildren, hostType, { ...hostRest, style: finalStyle }, finalKey);
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

  if (DARK_MODIFIER_RE.test(classStrRaw) || BREAKPOINT_MODIFIER_RE.test(classStrRaw) || classStrRaw.includes('var(--')) {
    return _jsx(
      ReactiveElement,
      { hostType: type, hostRest: rest, classStrRaw, userStyle, resolveStyle, elementKey: key, isStaticChildren },
      key,
    ) as ReactElement;
  }

  // Pressable is the one component that knows press state at all — style
  // becomes a function so active: can react to it. Every other type keeps
  // the plain, static resolution it always had (pressed is always false).
  const finalStyle =
    type === Pressable
      ? (state: PressableStateCallbackType) => resolvedStyleFor(resolveStyle, classStrRaw, userStyle, state.pressed)
      : resolvedStyleFor(resolveStyle, classStrRaw, userStyle, false);

  return makeElement(isStaticChildren, type, { ...rest, style: finalStyle }, key);
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
