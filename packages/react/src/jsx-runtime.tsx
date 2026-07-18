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
import { isWeb, isNative, getConfig, onConfigChange, resolve, flatten, getDefaultFontFamily, normalizeClassString, isRuntimeCSSDisabled, type ResolvedStyle } from './core';
import { getInteractiveModifiers, getModeModifiers, getResponsiveModifiers } from './core/registry';
import { InteractiveWrapper } from './InteractiveWrapper';
import { DarkWrapper } from './DarkWrapper';
import { getWebTag, transformToWebProps, registerWebElement } from './web-substitute';
import { stripInternalMarkers, stripWebOnlyProps as stripWebOnlyInlineProps } from './shared-utils';

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

// ─── Style merge helper ───────────────────────────────────────────────────────

function mergeStyle(
  computed: Record<string, unknown>,
  userStyle: unknown,
): Record<string, unknown> {
  if (!userStyle) return computed;
  if (Array.isArray(userStyle)) return Object.assign({}, computed, ...userStyle);
  return { ...computed, ...(userStyle as object) };
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

  // On web, substitute React Native components with HTML elements so the DOM
  // shows clean Kbach class names instead of RNW's css-view-* hash classes.
  // Pass rawProps to getWebTag so TextInput can pick 'textarea' vs 'input'.
  const webTag = isWeb ? getWebTag(type, rawProps ?? undefined) : null;
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
  const classStr: string | undefined = className ?? kbProp ?? __kbachClasses;

  // ── Static CSS fast path ─────────────────────────────────────────────────────
  // When kbach.css is the style source (Vite plugin), resolve(), flatten(), and
  // all wrapper logic are dead work — the CSS file handles everything.
  // Skip them entirely: just normalize className and forward the user's style prop.
  if (!isNative && isRuntimeCSSDisabled() && classStr && !__kbachStyles) {
    const { style: userStyle, ...passProps } = omitConsumed(workingProps) as any;
    return makeElement(isStaticChildren, effectiveType as any, {
      ...passProps,
      className: normalizeClassString(classStr),
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
    // On web, global CSS (injected by ThemeProvider via injectGlobalStyles) already sets
    // the default font-family — no per-element inline style needed.
    if (isWeb) return makeElement(isStaticChildren, effectiveType, omitConsumed(workingProps), key);
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

  const config = getConfig();
  // __kbachStyles = Babel-pre-resolved buckets (avoids runtime resolve on native).
  // On web (browser) we must call resolve() regardless so it injects the CSS rules
  // as a side effect — the pre-resolved object is an optimisation for native only.
  const resolved: ResolvedStyle =
    (!isWeb && (__kbachStyles as ResolvedStyle | undefined) != null)
      ? (__kbachStyles as ResolvedStyle)
      : (classStr ? resolve(classStr, config.theme, config.darkMode) : {});

  const { style: userStyle, ...passProps } = omitConsumed(workingProps) as any;

  // Bug #8: bucketMods result is memoized by resolved object reference.
  const { interactive, modeOrResponsive } = bucketMods(resolved);

  if (interactive) {
    return _jsx(InteractiveWrapper, {
      Component: effectiveType as any,
      resolvedStyle: resolved,
      ...(!isNative && classStr ? { className: normalizeClassString(classStr) } : {}),
      style: userStyle,
      ...passProps,
    }, key) as ReactElement;
  }

  if (modeOrResponsive) {
    return _jsx(DarkWrapper, {
      Component: effectiveType as any,
      resolvedStyle: resolved,
      ...(!isNative && classStr ? { className: normalizeClassString(classStr) } : {}),
      style: userStyle,
      ...passProps,
    }, key) as ReactElement;
  }

  // On web (browser), CSS classes handle all Kbach styles — skip flatten() and inline styles.
  // On native (no CSS), always flatten into inline styles.
  // On SSR (neither isWeb nor isNative): skip inline for HTML string elements, apply for components.
  const skipComputedInline = isWeb || (!isNative && typeof effectiveType === 'string');
  let finalStyle: Record<string, unknown> | undefined;
  if (!skipComputedInline) {
    const computedStyle = flatten(resolved, false) as Record<string, unknown>;
    stripInternalMarkers(computedStyle);
    if (typeof effectiveType !== 'string') stripWebOnlyInlineProps(computedStyle);
    finalStyle = mergeStyle(computedStyle, userStyle) as Record<string, unknown>;
  } else {
    finalStyle = userStyle as any ?? undefined;
  }

  return makeElement(isStaticChildren, effectiveType as any, {
    ...passProps,
    ...(finalStyle !== undefined ? { style: finalStyle } : {}),
    ...(!isNative && classStr ? { className: normalizeClassString(classStr) } : {}),
  }, key);
}

// ─── Runtime exports ──────────────────────────────────────────────────────────

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, false);
}

export function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, true);
}
