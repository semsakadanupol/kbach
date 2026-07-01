import React, { forwardRef, useState, useCallback, useMemo } from 'react';
import {
  flatten,
  isWeb,
  isNative,
  getActiveBreakpoints,
  type ResolvedStyle,
  type StyleValue,
} from './core';
import { useGlobalDarkMode } from './useGlobalDarkMode';
import { useConditionalWidth, EMPTY_BREAKPOINTS } from './useGlobalWidth';
import { hasResponsiveBuckets } from './shared-utils';

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
  onMouseEnter?: (...args: any[]) => void;
  onMouseLeave?: (...args: any[]) => void;
  onFocus?: (...args: any[]) => void;
  onBlur?: (...args: any[]) => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Chain two event handlers without losing the original. */
function chain<T extends (...args: any[]) => void>(
  original: T | undefined,
  extra: () => void,
): (...args: Parameters<T>) => void {
  return (...args) => {
    original?.(...args);
    extra();
  };
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
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const isDark = useGlobalDarkMode();

    // Only subscribe to width when this element actually has responsive classes.
    // Pure hover:/pressed:/focus: elements get NOOP_SUB — no resize re-renders.
    const needsWidth = hasResponsiveBuckets(resolvedStyle);
    const width = useConditionalWidth(needsWidth);
    const breakpoints = needsWidth ? getActiveBreakpoints(width) : EMPTY_BREAKPOINTS;

    const [pressed, setPressed] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);

    const handlePressIn = useCallback(chain(onPressIn, () => setPressed(true)), [onPressIn]);
    const handlePressOut = useCallback(chain(onPressOut, () => setPressed(false)), [onPressOut]);
    // Web: onPointerDown/onPointerUp drive the same pressed state (covers mouse + touch)
    const handlePointerDown = useCallback(chain(onPointerDown, () => setPressed(true)), [onPointerDown]);
    const handlePointerUp = useCallback(chain(onPointerUp, () => setPressed(false)), [onPointerUp]);
    const handlePointerLeave = useCallback(chain(onPointerLeave, () => setPressed(false)), [onPointerLeave]);
    const handleMouseEnter = useCallback(chain(onMouseEnter, () => setHovered(true)), [onMouseEnter]);
    const handleMouseLeave = useCallback(chain(onMouseLeave, () => setHovered(false)), [onMouseLeave]);
    const handleFocus = useCallback(chain(onFocus, () => setFocused(true)), [onFocus]);
    const handleBlur = useCallback(chain(onBlur, () => setFocused(false)), [onBlur]);

    const { children, disabled, checked, ...restForComponent } = rest as any;

    const computedStyle = useMemo(
      () => {
        // On web, CSS classes carry all styles — flatten() output is never applied as inline style.
        if (isWeb) return {} as Record<string, unknown>;
        const s = flatten(resolvedStyle, isDark, { pressed, hover: hovered, focus: focused, disabled: !!disabled, checked: !!checked }, breakpoints) as Record<string, unknown>;
        // Only strip web-only props for RN components. Native HTML elements ('div' etc.)
        // handle display:grid, gridTemplateColumns, and position:sticky as inline styles.
        delete s.__divideX; delete s.__divideY; delete s.__divideColor; delete s.__divideStyle;
        delete s.__keyframe;
        if (typeof Component !== 'string') {
          if (s.display === 'grid' || s.display === 'inline-grid') delete s.display;
          delete s.gridTemplateColumns; delete s.gridTemplateRows;
          delete s.gridColumn; delete s.gridRow; delete s.gridArea;
          delete s.gridColumnStart; delete s.gridColumnEnd;
          delete s.gridRowStart; delete s.gridRowEnd;
          delete s.gridAutoFlow; delete s.gridAutoColumns; delete s.gridAutoRows;
          delete s.placeItems; delete s.placeContent; delete s.justifyItems;
          delete s.placeSelf; delete s.justifySelf;
          if (s.position === 'sticky' || s.position === 'fixed' || s.position === 'static') {
            delete s.position;
          }
        }
        return s;
      },
      [resolvedStyle, isDark, pressed, hovered, focused, width, disabled, checked],
    );

    // On web (browser), CSS classes handle all Kbach styles — only forward user's explicit style.
    // On native, merge computedStyle with user's style prop.
    const skipComputedInline = isWeb || (!isNative && typeof Component === 'string');
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
      // On web, onPointerDown/Up drive the wrapper's own pressed state (covers mouse + touch),
      // but onPressIn/onPressOut are still forwarded unchanged — react-native-web components
      // (and any component that accepts both prop names) depend on receiving them directly.
      ...(!isNative
        ? { onPointerDown: handlePointerDown, onPointerUp: handlePointerUp, onPointerLeave: handlePointerLeave, onPointerCancel: handlePointerLeave, onPressIn, onPressOut }
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
