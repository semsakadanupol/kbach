import React, {
  forwardRef,
  useState,
  useCallback,
  useMemo,
  type ComponentType,
  type ForwardRefExoticComponent,
  type ReactElement,
} from 'react';
import { resolve, flatten, isNative, getEffectiveIsWeb, normalizeClassString, getActiveBreakpoints, type StyleValue, type ResolvedStyle } from './core';
import { useTheme } from './context';
import { useConditionalGlobalDarkMode } from './useGlobalDarkMode';
import { useConditionalWidth, EMPTY_BREAKPOINTS } from './useGlobalWidth';
import { hasResponsiveBuckets, hasInteractiveBuckets, chain } from './shared-utils';
import { getWebTag, transformToWebProps, getImpliedRNStyle } from './web-substitute';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StyledProps {
  /** Additional utility classes applied on top of the base classes */
  kb?: string;
  /** Merged with resolved kb styles; applied last */
  style?: StyleValue | StyleValue[];
}

type OmittedKeys = 'style';

// ─── styled() ─────────────────────────────────────────────────────────────────

/**
 * Create a styled component from any React / React Native component.
 *
 * ```tsx
 * const Card = styled(View, 'bg-white dark:bg-gray-800 rounded-xl p-4 shadow-md');
 * const Button = styled(TouchableOpacity, 'bg-blue-500 pressed:bg-blue-700 dark:bg-blue-600 rounded-lg p-3');
 *
 * // Use it:
 * <Card kb="mt-4">...</Card>
 * <Button onPress={handlePress} kb="w-full" />
 * ```
 */
export function styled<T extends ComponentType<any>>(
  Component: T,
  baseClasses: string = '',
): ForwardRefExoticComponent<
  Omit<React.ComponentPropsWithRef<T>, OmittedKeys> & StyledProps
> {
  const Styled = forwardRef<unknown, Omit<React.ComponentPropsWithRef<T>, OmittedKeys> & StyledProps>(
    (props, ref) => {
      const {
        kb: extraClasses,
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
      } = props as any;

      // Read for flatten state tracking (still forwarded to component via ...rest)
      const disabled: boolean = !!(props as any).disabled;
      const checked: boolean = !!(props as any).checked;

      const { config } = useTheme();

      // Computed once per render; stable for the app's whole lifetime (platform
      // never changes at runtime), so it's safe to gate hook subscriptions and
      // state setters on it below without violating rules of hooks (every hook
      // below is still called unconditionally, every render).
      const isWebPlatform = getEffectiveIsWeb();

      // On web, subscribing to the dark-mode store would re-render on every theme
      // toggle purely to recompute computedStyle — which is always {} on web (see
      // below), so the value is never actually used there.
      const isDark = useConditionalGlobalDarkMode(!isWebPlatform);

      // ── Interaction state ───────────────────────────────────────────────────
      const [pressed, setPressed] = useState(false);
      const [hovered, setHovered] = useState(false);
      const [focused, setFocused] = useState(false);

      // On web, real CSS :hover/:focus/:active pseudo-classes already handle the
      // visual change — this state only feeds computedStyle, which is discarded
      // on web. Skipping the setState call there avoids re-rendering on every
      // hover/focus/press on hover-heavy UIs for zero visible effect.
      // isWebPlatform is a stable primitive, so including it in a useCallback dep
      // array (alongside the user's handler) doesn't defeat the memoization.
      const handlePressIn = useCallback(chain(onPressIn, () => { if (!isWebPlatform) setPressed(true); }), [onPressIn, isWebPlatform]);
      const handlePressOut = useCallback(chain(onPressOut, () => { if (!isWebPlatform) setPressed(false); }), [onPressOut, isWebPlatform]);
      // Web equivalents of onPressIn/onPressOut (covers mouse + touch via Pointer Events)
      const handlePointerDown = useCallback(chain(onPointerDown, () => { if (!isWebPlatform) setPressed(true); }), [onPointerDown, isWebPlatform]);
      const handlePointerUp = useCallback(chain(onPointerUp, () => { if (!isWebPlatform) setPressed(false); }), [onPointerUp, isWebPlatform]);
      const handlePointerLeave = useCallback(chain(onPointerLeave, () => { if (!isWebPlatform) setPressed(false); }), [onPointerLeave, isWebPlatform]);
      const handlePointerCancel = useCallback(chain(onPointerCancel, () => { if (!isWebPlatform) setPressed(false); }), [onPointerCancel, isWebPlatform]);
      const handleMouseEnter = useCallback(chain(onMouseEnter, () => { if (!isWebPlatform) setHovered(true); }), [onMouseEnter, isWebPlatform]);
      const handleMouseLeave = useCallback(chain(onMouseLeave, () => { if (!isWebPlatform) setHovered(false); }), [onMouseLeave, isWebPlatform]);
      const handleFocus = useCallback(chain(onFocus, () => { if (!isWebPlatform) setFocused(true); }), [onFocus, isWebPlatform]);
      const handleBlur = useCallback(chain(onBlur, () => { if (!isWebPlatform) setFocused(false); }), [onBlur, isWebPlatform]);

      // ── Style resolution ────────────────────────────────────────────────────
      const combined = extraClasses ? `${baseClasses} ${extraClasses}` : baseClasses;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const resolved = useMemo(() => resolve(combined, config.theme, config.darkMode), [combined, config.theme, config.darkMode]);

      const hasInteractive = useMemo(() => hasInteractiveBuckets(resolved), [resolved]);
      // Only subscribe to width when this element has responsive classes AND
      // isn't on web (computedStyle is discarded on web regardless of breakpoints).
      const needsWidth = hasResponsiveBuckets(resolved);
      const width = useConditionalWidth(needsWidth && !isWebPlatform);
      const breakpoints = needsWidth ? getActiveBreakpoints(width) : EMPTY_BREAKPOINTS;

      // On web (browser and SSR alike), CSS classes carry all styles — flatten()
      // output is never applied as inline style. isWebPlatform comes from
      // getEffectiveIsWeb() (not raw `isWeb`) so SSR and the browser make the
      // identical choice on the same markup — otherwise one side renders a
      // `style` attribute the other omits, which React reports as a hydration
      // mismatch.
      const computedStyle = useMemo(
        () => isWebPlatform ? ({} as StyleValue) : flatten(resolved, isDark, { pressed, hover: hovered, focus: focused, disabled, checked }, breakpoints),
        [resolved, isDark, pressed, hovered, focused, disabled, checked, width], // eslint-disable-line react-hooks/exhaustive-deps
      );

      // On web (browser and SSR alike), substitute RN component types with HTML
      // elements so the DOM shows clean Kbach class names instead of React Native
      // Web's css-view-* hashes. Computed before finalStyle below — the web
      // branch needs webTag to restore RN's implied position/flex defaults via
      // getImpliedRNStyle (see web-substitute.ts). Must match on both sides of
      // hydration — see the computedStyle comment below.
      const webTag = isWebPlatform ? getWebTag(Component, rest) : null;

      // Web (and SSR): CSS classes carry all Kbach styles — only forward the
      // user's explicit style prop, plus the implied-RN-default compensation
      // (position:relative, and display:flex/flexDirection:column when this
      // resolves to flex) that a substituted HTML element doesn't get for free
      // the way a real RN primitive does. DOM's style attribute must be a plain
      // object, so an array styleProp still needs flattening here.
      //
      // Native: compose as an array rather than spreading styleProp into a
      // fresh object — react-native-reanimated's useAnimatedStyle() returns
      // an object the native UI thread mutates by reference (this is the
      // most common way anyone combines styled() with Reanimated — e.g.
      // `styled(Animated.View, '...')`), and Object.assign/spread would copy
      // out today's snapshot and permanently disconnect it from Reanimated's
      // runtime. React Native's style prop already accepts arrays (later
      // entries win on conflicts, same precedence spreading had), so
      // composing one here preserves styleProp's identity through to the
      // native renderer regardless of what it actually is.
      const finalStyle: StyleValue | unknown[] | undefined = isWebPlatform
        ? (() => {
            const flatStyleProp = (Array.isArray(styleProp) ? Object.assign({}, ...styleProp) : styleProp) ?? undefined;
            const compensation = getImpliedRNStyle(webTag, resolved.base as Record<string, unknown> | undefined);
            if (!compensation) return flatStyleProp;
            return flatStyleProp ? { ...compensation, ...flatStyleProp } : compensation;
          })()
        : styleProp
          ? (Array.isArray(styleProp) ? [computedStyle, ...styleProp] : [computedStyle, styleProp])
          : computedStyle;

      const effectiveComponent: unknown = webTag ?? Component;
      const componentName: string = (Component as any).displayName ?? (Component as any).name ?? '';
      const effectiveRest: Record<string, unknown> = (webTag && componentName)
        ? transformToWebProps(componentName, webTag, rest)
        : rest;

      return React.createElement(effectiveComponent as any, {
        ref,
        ...effectiveRest,
        style: finalStyle,
        // className lets injected CSS rules (group-hover:, before:, print:, etc.) match the element.
        ...(isWebPlatform && combined ? { className: normalizeClassString(combined) } : {}),
        // Only attach state-tracking handlers when interactive modifiers are present.
        // Always forward user-provided handlers to avoid silently swallowing them.
        // Gated on isNative, not isWeb: isWeb is false during SSR too (no `window` there),
        // and onPressIn/onPressOut must stay excluded there as well — SSR is exactly where
        // getWebTag() above is skipped (it's isWeb-gated), so effectiveComponent may still be
        // a non-string RN-style reference server-side, and this used to forward onPressIn/
        // onPressOut to it unconditionally in that case (isWeb ? ... : ...'s false branch
        // covered both native AND SSR). onPressIn/onPressOut are RN-only prop names — a
        // non-string effectiveComponent on the web/SSR side is just as likely to be an
        // ordinary web component (React Router's <Link>, Next.js's <Link>, any custom
        // wrapper) as an actual react-native-web primitive, and "not a string" alone isn't a
        // reliable signal either way. Forwarding them made React DOM warn "Unknown event
        // handler property" the moment any such component got an interactive modifier
        // (hover:, active:, …), which is the common case, not the exception.
        ...(!isNative
          ? (hasInteractive
              ? {
                  onPointerDown: handlePointerDown, onPointerUp: handlePointerUp,
                  onPointerLeave: handlePointerLeave, onPointerCancel: handlePointerCancel,
                }
              : {
                  onPointerDown, onPointerUp, onPointerLeave, onPointerCancel,
                })
          : (hasInteractive
              ? { onPressIn: handlePressIn, onPressOut: handlePressOut }
              : { onPressIn, onPressOut })),
        onMouseEnter: hasInteractive ? handleMouseEnter : onMouseEnter,
        onMouseLeave: hasInteractive ? handleMouseLeave : onMouseLeave,
        onFocus: hasInteractive ? handleFocus : onFocus,
        onBlur: hasInteractive ? handleBlur : onBlur,
      });
    },
  );

  // Improve DevTools display name
  const componentName =
    (Component as any).displayName ??
    (Component as any).name ??
    'Component';
  Styled.displayName = `Styled(${componentName})`;

  return Styled as any;
}
