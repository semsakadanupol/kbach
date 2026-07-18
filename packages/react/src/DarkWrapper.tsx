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
  isWeb,
  isNative,
  getActiveBreakpoints,
  getGlobalScreens,
  type ResolvedStyle,
  type StyleValue,
} from './core';
import { useGlobalDarkMode } from './useGlobalDarkMode';
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
    const isDark = useGlobalDarkMode();

    // Only subscribe to width when this element actually has responsive classes.
    // Pure dark:/light: elements get NOOP_SUB — no resize re-renders for them.
    const needsWidth = hasResponsiveBuckets(resolvedStyle);
    const width = useConditionalWidth(needsWidth);
    const breakpoints = needsWidth ? getActiveBreakpoints(width) : EMPTY_BREAKPOINTS;

    const screens = getGlobalScreens();
    const isNonStringComponent = typeof Component !== 'string';
    const computedStyle = useMemo(() => {
      // On web, CSS classes carry all styles — flatten() output is never applied as inline style.
      if (isWeb) return {} as Record<string, unknown>;
      const s = flatten(resolvedStyle as ResolvedStyle, isDark, {}, breakpoints) as Record<string, unknown>;
      stripInternalMarkers(s);
      if (isNonStringComponent) stripWebOnlyProps(s);
      return s;
    }, [resolvedStyle, isDark, width, screens, isNonStringComponent]);

    // On web (browser), CSS classes handle all Kbach styles — only forward user's explicit style.
    // On native, merge computedStyle with user's style prop.
    const skipComputedInline = isWeb || (!isNative && typeof Component === 'string');
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
