import React, { forwardRef, useState, useCallback, useMemo } from 'react';
import {
  flatten,
  isNative,
  getEffectiveIsWeb,
  getActiveBreakpoints,
  type ResolvedStyle,
  type StyleValue,
} from './core';
import { useConditionalGlobalDarkMode } from './useGlobalDarkMode';
import { useConditionalWidth, EMPTY_BREAKPOINTS } from './useGlobalWidth';
import { hasResponsiveBuckets, stripInternalMarkers, stripWebOnlyProps, chain } from './shared-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InteractiveWrapperProps {
  /** The real component to render (View, TouchableOpacity, div, a third-party button…) */
  Component: React.ComponentType<any> | string;
  /** Pre-resolved style buckets from resolve() */
  resolvedStyle: ResolvedStyle;
  /** On web: original class string so CSS pseudo-rules still fire */
  className?: string;
  /** Extra style prop passed by the user */
  style?: StyleValue | StyleValue[];
  children?: React.ReactNode;
  // Event callbacks — forwarded from the original element props
  onPressIn?: (...args: any[]) => void;
  onPressOut?: (...args: any[]) => void;
  onPointerDown?: (...args: any[]) => void;
  onPointerUp?: (...args: any[]) => void;
  onPointerLeave?: (...args: any[]) => void;
  onPointerCancel?: (...args: any[]) => void;
  onMouseEnter?: (...args: any[]) => void;
  onMouseLeave?: (...args: any[]) => void;
  onFocus?: (...args: any[]) => void;
  onBlur?: (...args: any[]) => void;
}

// ─── InteractiveWrapper ───────────────────────────────────────────────────────

/**
 * Thin wrapper rendered automatically by the JSX runtime whenever a className/kb
 * string contains interactive modifiers (hover:, pressed:, focus:, active:, …).
 *
 * Manages interaction state locally and flattens the correct style bucket on
 * every render. The wrapped component sees a plain `style` prop — it never
 * knows it was wrapped.
 *
 * Refs are forwarded so the host component's imperative API still works.
 */
export const InteractiveWrapper = forwardRef<unknown, InteractiveWrapperProps>(
  function InteractiveWrapper(
    {
      Component,
      resolvedStyle,
      className,
      style: styleProp,
      onPressIn,
      onPressOut,
      onPointerDown,
      onPointerUp,
      onPointerLeave,
      onPointerCancel,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    // Computed once per render, not once per app — but stable for the app's whole
    // lifetime (platform never changes at runtime), so it's safe to gate hook
    // *subscriptions* and state *setters* on it below without violating rules of
    // hooks (every hook below is still called unconditionally, every render).
    const isWebPlatform = getEffectiveIsWeb();

    // On web, subscribing to the dark-mode store would re-render this element on
    // every theme toggle purely to recompute computedStyle — which is always {}
    // on web (see below), so the value is never actually used there.
    const isDark = useConditionalGlobalDarkMode(!isWebPlatform);

    // Only subscribe to width when this element actually has responsive classes
    // AND isn't on web (same reasoning as isDark above — computedStyle is
    // discarded on web regardless of breakpoints). Pure hover:/pressed:/focus:
    // elements, or any element on web, get NOOP_SUB — no resize re-renders.
    const needsWidth = hasResponsiveBuckets(resolvedStyle);
    const width = useConditionalWidth(needsWidth && !isWebPlatform);
    const breakpoints = needsWidth ? getActiveBreakpoints(width) : EMPTY_BREAKPOINTS;

    const [pressed, setPressed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    // On web, real CSS :hover/:focus/:active pseudo-classes already handle the
    // visual change — this wrapper's own pressed/hovered/focused state only
    // feeds computedStyle, which is discarded on web. Skipping the setState call
    // there avoids re-rendering on every hover/focus/press on hover-heavy UIs
    // (tables, nav, lists) for zero visible effect. isWebPlatform is a primitive
    // boolean that's stable for the app's whole lifetime, so including it in a
    // useCallback dep array (alongside the user's handler) doesn't defeat the
    // memoization the way a freshly-allocated function reference would.
    const handlePressIn = useCallback(chain(onPressIn, () => { if (!isWebPlatform) setPressed(true); }), [onPressIn, isWebPlatform]);
    const handlePressOut = useCallback(chain(onPressOut, () => { if (!isWebPlatform) setPressed(false); }), [onPressOut, isWebPlatform]);
    // Web: onPointerDown/onPointerUp drive the same pressed state (covers mouse + touch)
    const handlePointerDown = useCallback(chain(onPointerDown, () => { if (!isWebPlatform) setPressed(true); }), [onPointerDown, isWebPlatform]);
    const handlePointerUp = useCallback(chain(onPointerUp, () => { if (!isWebPlatform) setPressed(false); }), [onPointerUp, isWebPlatform]);
    const handlePointerLeave = useCallback(chain(onPointerLeave, () => { if (!isWebPlatform) setPressed(false); }), [onPointerLeave, isWebPlatform]);
    const handlePointerCancel = useCallback(chain(onPointerCancel, () => { if (!isWebPlatform) setPressed(false); }), [onPointerCancel, isWebPlatform]);
    const handleMouseEnter = useCallback(chain(onMouseEnter, () => { if (!isWebPlatform) setHovered(true); }), [onMouseEnter, isWebPlatform]);
    const handleMouseLeave = useCallback(chain(onMouseLeave, () => { if (!isWebPlatform) setHovered(false); }), [onMouseLeave, isWebPlatform]);
    const handleFocus = useCallback(chain(onFocus, () => { if (!isWebPlatform) setFocused(true); }), [onFocus, isWebPlatform]);
    const handleBlur = useCallback(chain(onBlur, () => { if (!isWebPlatform) setFocused(false); }), [onBlur, isWebPlatform]);

    const { children, disabled, checked, ...restForComponent } = rest as any;

    const computedStyle = useMemo(
      () => {
        // On web (browser and SSR alike), CSS classes carry all styles — flatten()
        // output is never applied as inline style. isWebPlatform comes from
        // getEffectiveIsWeb() (not raw `isWeb`) so SSR and the browser make the
        // identical choice on the same markup, avoiding a hydration mismatch.
        if (isWebPlatform) return {} as Record<string, unknown>;
        const s = flatten(resolvedStyle, isDark, { pressed, hover: hovered, focus: focused, disabled: !!disabled, checked: !!checked }, breakpoints) as Record<string, unknown>;
        // Only strip web-only props for RN components. Native HTML elements ('div' etc.)
        // handle display:grid, gridTemplateColumns, and position:sticky as inline styles.
        stripInternalMarkers(s);
        if (typeof Component !== 'string') stripWebOnlyProps(s);
        return s;
      },
      [resolvedStyle, isDark, pressed, hovered, focused, width, disabled, checked],
    );

    // On web (browser and SSR alike), CSS classes handle all Kbach styles — only
    // forward user's explicit style. On native, merge computedStyle with user's style prop.
    const skipComputedInline = isWebPlatform;
    const finalStyle: StyleValue = skipComputedInline
      ? (styleProp ?? undefined)
      : styleProp
        ? Array.isArray(styleProp)
          ? Object.assign({}, computedStyle, ...styleProp)
          : { ...computedStyle, ...(styleProp as StyleValue) }
        : computedStyle;

    const componentProps = {
      ref,
      ...restForComponent,
      ...(disabled !== undefined ? { disabled } : {}),
      ...(checked !== undefined ? { checked } : {}),
      style: finalStyle,
      ...(!isNative && className ? { className } : {}),
      // On web, onPointerDown/Up drive the wrapper's own pressed state (covers mouse + touch) —
      // onPressIn/onPressOut are RN-only prop names and are never forwarded here, even when
      // Component isn't a literal HTML tag string. A non-string Component on web is just as
      // likely to be an ordinary web component (React Router's <Link>, Next.js's <Link>, any
      // custom wrapper) as an actual react-native-web primitive — "not a string" alone was never
      // a reliable signal that onPressIn/onPressOut are wanted, and forwarding them
      // unconditionally made React DOM warn "Unknown event handler property" the moment any web
      // component got an interactive modifier (hover:, active:, …), which is the common case,
      // not the exception. (A real react-native-web primitive would additionally have this pair
      // of props silently vanish after hydration anyway, once the browser-only web-substitution
      // in jsx-runtime.tsx swaps it for a plain host tag — so keeping them pre-hydration would
      // only have traded one prop-mismatch warning for another.) Genuinely native code paths
      // still get them via the isNative branch below.
      ...(!isNative
        ? {
            onPointerDown: handlePointerDown, onPointerUp: handlePointerUp,
            onPointerLeave: handlePointerLeave, onPointerCancel: handlePointerCancel,
          }
        : { onPressIn: handlePressIn, onPressOut: handlePressOut }),
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
    };

    // Spread children as individual rest args so React doesn't see an array
    // in props and warn about missing keys for static child lists.
    return Array.isArray(children)
      ? React.createElement(Component as any, componentProps, ...children)
      : React.createElement(Component as any, componentProps, children);
  },
);

InteractiveWrapper.displayName = 'Kbach.InteractiveWrapper';
