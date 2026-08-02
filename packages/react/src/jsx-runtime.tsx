/**
 * @kbach/react/jsx-runtime
 *
 * Drop-in replacement for react/jsx-runtime.
 * Intercepts `className` and `kb` props on EVERY JSX element — React Native
 * built-ins, HTML elements on web, and any third-party library component.
 */

import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Fragment } from 'react';
import type { ReactElement } from 'react';
import { isWeb, isNative, getEffectiveIsWeb, getConfig, onConfigChange, resolve, flatten, getDefaultFontFamily, normalizeClassString, isRuntimeCSSDisabled, getInteractiveModifiers, getModeModifiers, getResponsiveModifiers, expandModeAwareColorClasses, type ResolvedStyle } from './core';
import { InteractiveWrapper } from './InteractiveWrapper';
import { DarkWrapper } from './DarkWrapper';
import { getWebTag, transformToWebProps, registerWebElement, getImpliedRNStyle } from './web-substitute';
import { stripInternalMarkers, stripWebOnlyProps as stripWebOnlyInlineProps, composeNativeStyle } from './shared-utils';

export { registerWebElement };

export { Fragment };
export type { JSX } from 'react';

// ─── Bug #16: cached default-font sentinel ────────────────────────────────────
// getDefaultFontFamily() hits globalThis on every call. We cache the last seen
// value so elements without any class string pay only a single variable comparison
// instead of a property lookup on every render.
let _cachedDefaultFont: string | undefined = undefined;
let _defaultFontVersion = 0;
let _lastFontVersion = -1;

export function _invalidateDefaultFontCache(): void {
  _defaultFontVersion++;
}

// Bust the cache whenever config updates (setDefaultFontFamily may change font).
// Store unsub on globalThis so Fast Refresh re-evaluations replace the old
// listener instead of accumulating unbounded duplicate entries.
{
  const _KEY = '__kbach_font_cache_unsub__';
  const g = globalThis as any;
  if (g[_KEY]) g[_KEY](); // unsubscribe previous module version's listener
  g[_KEY] = onConfigChange(_invalidateDefaultFontCache as any);
}

function getCachedDefaultFont(): string | undefined {
  if (_lastFontVersion !== _defaultFontVersion) {
    _cachedDefaultFont = getDefaultFontFamily();
    _lastFontVersion = _defaultFontVersion;
  }
  return _cachedDefaultFont;
}

// ─── Bug #8: bucketMods memoized per ResolvedStyle object ─────────────────────
// Called on every element render. Since resolve() returns the same object
// reference on cache-hit, this WeakMap hits on all subsequent renders for the
// same class string.

interface BucketMeta { interactive: boolean; modeOrResponsive: boolean }
const _bucketModsCache = new WeakMap<object, BucketMeta>();

function bucketMods(resolved: ResolvedStyle): BucketMeta {
  const cached = _bucketModsCache.get(resolved);
  if (cached) return cached;

  const interactiveMods = getInteractiveModifiers();
  const modeMods = getModeModifiers();
  const responsiveMods = getResponsiveModifiers();

  let interactive = false;
  let modeOrResponsive = false;

  for (const key of Object.keys(resolved)) {
    if (key === 'base') continue;
    for (const mod of key.split(':')) {
      if (!interactive && interactiveMods.has(mod)) interactive = true;
      if (!modeOrResponsive && (modeMods.has(mod) || responsiveMods.has(mod))) modeOrResponsive = true;
    }
    if (interactive && modeOrResponsive) break;
  }

  const result: BucketMeta = { interactive, modeOrResponsive };
  _bucketModsCache.set(resolved, result);
  return result;
}

// ─── Prop omit helper ─────────────────────────────────────────────────────────

const CONSUMED_PROPS = new Set(['className', 'kb', '__kbachStyles', '__kbachClasses']);

function omitConsumed(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (!CONSUMED_PROPS.has(key)) out[key] = props[key];
  }
  return out;
}

// ─── Substituted-RN-primitive layout compensation ─────────────────────────────
//
// See web-substitute.ts's getImpliedRNStyle for what's being restored and why.
// Applied as a per-element inline style override rather than touching the
// shared class rule — inline style always wins over class-based CSS, so this
// can't leak into other elements using the same class, and an explicit
// relative/absolute/flex-row/flex-col/display:block elsewhere in the same
// className always wins over this (checked via resolvedBase, which already
// reflects it).
function withImpliedRNStyleIfNeeded(
  webTag: string | null,
  resolvedBase: Record<string, unknown> | undefined,
  userStyle: unknown,
): unknown {
  const compensation = getImpliedRNStyle(webTag, resolvedBase);
  if (!compensation) return userStyle;

  // User's own explicit style still wins on conflict.
  return Array.isArray(userStyle)
    ? [compensation, ...userStyle]
    : { ...compensation, ...(userStyle as object | undefined) };
}

// ─── Element factory ──────────────────────────────────────────────────────────

function makeElement(
  isStaticChildren: boolean,
  type: any,
  props: Record<string, unknown>,
  key: string | undefined,
): ReactElement {
  return (isStaticChildren ? _jsxs : _jsx)(type, props, key) as ReactElement;
}

// ─── Core element processor ───────────────────────────────────────────────────

function processElement(
  type: unknown,
  rawProps: Record<string, unknown> | null,
  key: string | undefined,
  isStaticChildren: boolean,
): ReactElement {
  if (type === null || typeof type === 'symbol') return makeElement(isStaticChildren, type, rawProps ?? {}, key);

  // On web (including Node.js SSR, which renders web HTML — see platform.ts),
  // substitute React Native components with HTML elements so the DOM shows clean
  // Kbach class names instead of RNW's css-view-* hash classes. Using the raw
  // `isWeb` constant here would make SSR skip substitution (isWeb is false in
  // Node) while the browser applies it (isWeb is true there), producing a
  // different element type server- vs client-side and a hydration mismatch on
  // every affected element. getEffectiveIsWeb() is true in both the browser and
  // Node SSR, and false only in a real React Native runtime.
  // Pass rawProps to getWebTag so TextInput can pick 'textarea' vs 'input'.
  const webTag = getEffectiveIsWeb() ? getWebTag(type, rawProps ?? undefined) : null;
  const effectiveType: unknown = webTag ?? type;
  const originalName: string | undefined = webTag
    ? ((type as any)?.displayName ?? (type as any)?.name)
    : undefined;

  if (!rawProps) return _jsx(effectiveType as any, null as any, key);

  // Remap RN-specific props to web equivalents for substituted components.
  const workingProps: Record<string, unknown> = (webTag && originalName)
    ? transformToWebProps(originalName, webTag, rawProps)
    : rawProps;

  const { className, kb: kbProp, __kbachStyles, __kbachClasses } = workingProps as any;
  const classStrRaw: unknown = className ?? kbProp ?? __kbachClasses;

  // className/kb isn't always a plain string — third-party components can declare
  // their own contract for it, e.g. react-router's <NavLink className={({isActive}) =>
  // '...'}>. Kbach only knows how to resolve a literal class string; anything else
  // (a function, in that example) isn't ours to touch, so skip interception entirely
  // and forward the element untouched. Without this, splitClassTokens() below would
  // iterate a function by its `.length` (arity) instead of a string's, silently
  // producing the single garbage token "undefined" instead of erroring loudly.
  if (classStrRaw !== undefined && typeof classStrRaw !== 'string') {
    return makeElement(isStaticChildren, effectiveType as any, workingProps, key);
  }
  const classStr: string | undefined = classStrRaw;

  // Mode-aware colors (kbach.config.js colors shaped `{ light, dark }`) are
  // expanded from their semantic name (e.g. `bg-surface`) into an explicit
  // `bg-[#hex] dark:bg-[#hex2]` pair right here, before ANYTHING else touches
  // classStr. That's deliberate: the CSS Kbach generates/injects for this
  // element is keyed off the expanded token text (see modeAwareColors.ts and
  // resolver.ts's resolve()/generateClassCSS()), so the literal className
  // string landing on the DOM has to be the SAME expanded text everywhere —
  // the static-CSS fast path below, the two wrapper components, and the plain
  // path all set `className` from this one variable rather than each
  // re-deriving it, so they can't drift out of sync with each other.
  // getConfig() is hoisted up here (was previously fetched further down)
  // purely so the fast path below — which returns before that later point —
  // can reach theme.colors too. Cheap: a memoized singleton read.
  const config = getConfig();
  const expandedClassStr = classStr ? expandModeAwareColorClasses(classStr, config.theme.colors) : classStr;

  // ── Static CSS fast path ─────────────────────────────────────────────────────
  // When kbach.css is the style source (Vite plugin), resolve(), flatten(), and
  // all wrapper logic are dead work — the CSS file handles everything.
  // Skip them entirely: just normalize className and forward the user's style prop.
  if (!isNative && isRuntimeCSSDisabled() && expandedClassStr && !__kbachStyles) {
    const { style: userStyle, ...passProps } = omitConsumed(workingProps) as any;
    return makeElement(isStaticChildren, effectiveType as any, {
      ...passProps,
      className: normalizeClassString(expandedClassStr),
      ...(userStyle !== undefined ? { style: userStyle } : {}),
    }, key);
  }

  // If every token in classStr starts with __ AND contains no hyphen/colon, treat it as a
  // framework-internal class (Expo Fast Refresh, React DevTools, etc.) and pass it through
  // as-is without kbach resolution. The hyphen/colon exclusion keeps this from swallowing a
  // real user utility or modifier class that merely happens to start with "__"
  // (e.g. "__brand-highlight", "dark:__brand-highlight").
  if (classStr && !__kbachStyles && /^(__[A-Za-z0-9_]+\s*)+$/.test(classStr.trim())) {
    const { style: userStyle, ...passProps } = omitConsumed(workingProps) as any;
    return makeElement(isStaticChildren, effectiveType as any, {
      ...passProps,
      className: classStr,
      ...(userStyle !== undefined ? { style: userStyle } : {}),
    }, key);
  }

  if (!classStr && !__kbachStyles) {
    // On web (including SSR), global CSS (injected by ThemeProvider via
    // injectGlobalStyles) already sets the default font-family — no per-element
    // inline style needed. Must match the client's decision exactly (both use
    // getEffectiveIsWeb()): if SSR added this inline style but the browser's
    // first render didn't (or vice versa), React sees a style-attribute
    // mismatch on every bare element during hydration.
    if (getEffectiveIsWeb()) return makeElement(isStaticChildren, effectiveType, omitConsumed(workingProps), key);
    // Bug #16: use cached font sentinel — avoids globalThis lookup on every bare element.
    const defaultFont = getCachedDefaultFont();
    if (!defaultFont) return makeElement(isStaticChildren, effectiveType, workingProps, key);
    const { style: userStyle, ...passProps } = omitConsumed(workingProps) as any;
    const finalStyle = userStyle
      ? Array.isArray(userStyle)
        ? { fontFamily: defaultFont, ...Object.assign({}, ...userStyle) }
        : { fontFamily: defaultFont, ...(userStyle as object) }
      : { fontFamily: defaultFont };
    return makeElement(isStaticChildren, effectiveType, { ...passProps, style: finalStyle }, key);
  }

  // __kbachStyles = Babel-pre-resolved buckets (avoids runtime resolve on native).
  // On web (browser) we must call resolve() regardless so it injects the CSS rules
  // as a side effect — the pre-resolved object is an optimisation for native only.
  // resolve() runs its own (idempotent, cheap-to-skip) mode-aware expansion
  // internally too — see resolver.ts — so passing the already-expanded string
  // here is only to avoid a second wasted pass, not required for correctness.
  const resolved: ResolvedStyle =
    (!isWeb && (__kbachStyles as ResolvedStyle | undefined) != null)
      ? (__kbachStyles as ResolvedStyle)
      : (expandedClassStr ? resolve(expandedClassStr, config.theme, config.darkMode) : {});

  const { style: rawUserStyle, ...passProps } = omitConsumed(workingProps) as any;
  const userStyle = withImpliedRNStyleIfNeeded(webTag, resolved.base as Record<string, unknown> | undefined, rawUserStyle);

  // Bug #8: bucketMods result is memoized by resolved object reference.
  const { interactive, modeOrResponsive } = bucketMods(resolved);

  if (interactive) {
    return _jsx(InteractiveWrapper, {
      Component: effectiveType as any,
      resolvedStyle: resolved,
      ...(!isNative && expandedClassStr ? { className: normalizeClassString(expandedClassStr) } : {}),
      style: userStyle,
      ...passProps,
    }, key) as ReactElement;
  }

  if (modeOrResponsive) {
    return _jsx(DarkWrapper, {
      Component: effectiveType as any,
      resolvedStyle: resolved,
      ...(!isNative && expandedClassStr ? { className: normalizeClassString(expandedClassStr) } : {}),
      style: userStyle,
      ...passProps,
    }, key) as ReactElement;
  }

  // On web (browser and SSR alike), CSS classes handle all Kbach styles — skip
  // flatten() and inline styles. On native (no CSS), always flatten into inline
  // styles. Must use getEffectiveIsWeb() (not raw `isWeb`) so SSR makes exactly
  // the same skip/apply decision the browser will make on the same markup —
  // otherwise the server adds an inline `style` the client's first render
  // omits (or vice versa), which React reports as a hydration mismatch.
  const skipComputedInline = getEffectiveIsWeb();
  let finalStyle: Record<string, unknown> | unknown[] | undefined;
  if (!skipComputedInline) {
    const computedStyle = flatten(resolved, false) as Record<string, unknown>;
    stripInternalMarkers(computedStyle);
    if (typeof effectiveType !== 'string') stripWebOnlyInlineProps(computedStyle);
    finalStyle = composeNativeStyle(computedStyle, userStyle);
  } else {
    finalStyle = userStyle as any ?? undefined;
  }

  return makeElement(isStaticChildren, effectiveType as any, {
    ...passProps,
    ...(finalStyle !== undefined ? { style: finalStyle } : {}),
    ...(!isNative && expandedClassStr ? { className: normalizeClassString(expandedClassStr) } : {}),
  }, key);
}

// ─── Runtime exports ──────────────────────────────────────────────────────────

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, false);
}

export function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, true);
}
