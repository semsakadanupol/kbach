/**
 * Thin wrapper component for JSX elements that have dark:/light: class variants.
 *
 * Why this exists:
 * React's "same-props bailout" optimization skips re-rendering function components
 * when their props reference hasn't changed, even when a parent re-renders.
 * This means a stable component like <AppContent /> that never changes its own props
 * may not re-render when ThemeProvider's state changes — and any <View className="dark:...">
 * elements inside it would keep showing stale styles.
 *
 * DarkWrapper subscribes to the global dark-mode store via useSyncExternalStore, so it
 * re-renders independently (via subscriber notification) whenever setGlobalDarkMode fires,
 * regardless of what its parent component is doing.
 */

import React, { useMemo } from 'react';
import {
  flatten,
  getEffectiveIsWeb,
  getActiveBreakpoints,
  getGlobalScreens,
  type ResolvedStyle,
  type StyleValue,
} from './core';
import { useConditionalGlobalDarkMode } from './useGlobalDarkMode';
import { useConditionalWidth, EMPTY_BREAKPOINTS } from './useGlobalWidth';
import { hasResponsiveBuckets, stripInternalMarkers, stripWebOnlyProps } from './shared-utils';

export interface DarkWrapperProps {
  Component: React.ComponentType<any> | string;
  resolvedStyle: ResolvedStyle;
  style?: StyleValue | StyleValue[];
  children?: React.ReactNode;
}

// Note: DarkWrapperProps intentionally has no string index signature. Combining
// React.forwardRef<T, P> with a P that carries an index signature makes TS widen
// every destructured property (even explicitly declared ones) to `unknown` —
// see InteractiveWrapper.tsx for the same pattern (rest cast to `any` below
// instead of typing it on the interface).
export const DarkWrapper = React.forwardRef<unknown, DarkWrapperProps>(
  function DarkWrapper({ Component, resolvedStyle, style: styleProp, children, ...rest }, ref) {
    // Computed once per render; stable for the app's whole lifetime (platform
    // never changes at runtime), so it's safe to gate hook subscriptions on it
    // below without violating rules of hooks (every hook is still called
    // unconditionally, every render).
    const isWebPlatform = getEffectiveIsWeb();

    // On web, subscribing to the dark-mode store would re-render this element on
    // every theme toggle purely to recompute computedStyle — which is always {}
    // on web (see below), so the value is never actually used there.
    const isDark = useConditionalGlobalDarkMode(!isWebPlatform);

    // Only subscribe to width when this element actually has responsive classes
    // AND isn't on web (computedStyle is discarded on web regardless of
    // breakpoints). Pure dark:/light: elements, or any element on web, get
    // NOOP_SUB — no resize re-renders.
    const needsWidth = hasResponsiveBuckets(resolvedStyle);
    const width = useConditionalWidth(needsWidth && !isWebPlatform);
    const breakpoints = needsWidth ? getActiveBreakpoints(width) : EMPTY_BREAKPOINTS;

    const screens = getGlobalScreens();
    const isNonStringComponent = typeof Component !== 'string';
    const computedStyle = useMemo(() => {
      // On web (browser and SSR alike), CSS classes carry all styles — flatten()
      // output is never applied as inline style. isWebPlatform comes from
      // getEffectiveIsWeb() (not raw `isWeb`) so SSR and the browser make the
      // identical choice on the same markup, avoiding a hydration mismatch.
      if (isWebPlatform) return {} as Record<string, unknown>;
      const s = flatten(resolvedStyle as ResolvedStyle, isDark, {}, breakpoints) as Record<string, unknown>;
      stripInternalMarkers(s);
      if (isNonStringComponent) stripWebOnlyProps(s);
      return s;
    }, [resolvedStyle, isDark, width, screens, isNonStringComponent]);

    // On web (browser and SSR alike), CSS classes handle all Kbach styles — only
    // forward user's explicit style. On native, merge computedStyle with user's style prop.
    const skipComputedInline = isWebPlatform;
    const finalStyle: StyleValue = skipComputedInline
      ? (styleProp ?? undefined)
      : styleProp
        ? Array.isArray(styleProp)
          ? Object.assign({}, computedStyle, ...(styleProp as object[]))
          : { ...computedStyle, ...(styleProp as object) }
        : computedStyle;

    const props: Record<string, unknown> = { ref, ...rest, style: finalStyle };
    return Array.isArray(children)
      ? React.createElement(Component as any, props, ...children)
      : React.createElement(Component as any, props, children as React.ReactNode);
  },
);
DarkWrapper.displayName = 'Kbach.DarkWrapper';
