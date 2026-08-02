/**
 * React Native → HTML element substitution for web rendering.
 *
 * When isWeb is true, known React Native component types (View, Text, Pressable, …)
 * are replaced with plain HTML element strings ('div', 'span', …) so the DOM shows
 * clean Kbach class names instead of React Native Web's generated css-view-* classes.
 *
 * Used by: jsx-runtime (bare JSX), styled(), DarkWrapper, InteractiveWrapper.
 */

// ─── Built-in substitution table ─────────────────────────────────────────────

const _rnToHtml: Record<string, string> = {
  View: 'div',
  SafeAreaView: 'div',
  KeyboardAvoidingView: 'div',
  ScrollView: 'div',
  VirtualizedList: 'div',
  FlatList: 'div',
  SectionList: 'div',
  Text: 'span',
  TextInput: 'input',
  Image: 'img',
  ImageBackground: 'div',
  Pressable: 'div',
  TouchableOpacity: 'div',
  TouchableHighlight: 'div',
  TouchableWithoutFeedback: 'div',
  TouchableNativeFeedback: 'div',
};

// ─── User-extensible registry ─────────────────────────────────────────────────

const _userMap = new Map<object, string>();
const _cache = new WeakMap<object, string | null>();

/**
 * Register a custom React Native component → HTML tag substitution.
 * Call once at app startup before first render.
 *
 * ```ts
 * import { Animated } from 'react-native';
 * import { registerWebElement } from '@kbach/react';
 * registerWebElement(Animated.View, 'div');
 * ```
 */
export function registerWebElement(rnComponent: unknown, htmlTag: string): void {
  if (typeof rnComponent !== 'object' && typeof rnComponent !== 'function') return;
  _userMap.set(rnComponent as object, htmlTag);
  _cache.delete(rnComponent as object);
}

// react.forward_ref / react.memo exotic-object markers — how React tags the
// object returned by React.forwardRef()/React.memo(). Real RN primitives
// (View, Text, Pressable, TextInput, …) are implemented this way in both
// react-native and react-native-web.
const _forwardRefOrMemoType = new Set<unknown>([
  Symbol.for('react.forward_ref'),
  Symbol.for('react.memo'),
]);

/**
 * True for real RN primitives (forwardRef-wrapped, or a class component with
 * React.Component in its prototype chain, e.g. FlatList/SectionList). False
 * for plain function components — including React Native's own and
 * react-native-reanimated's `createAnimatedComponent()` wrappers (Animated.View,
 * Animated.Text, …), which deliberately re-borrow the wrapped component's own
 * `name`/`displayName` (so `Animated.View.displayName === 'View'`) but are a
 * PLAIN arrow function under the hood — nothing else distinguishes them
 * structurally from an ordinary custom "View"-named function component. Without
 * this check, name-based matching alone would silently substitute Animated.View
 * for a bare `<div>`, discarding createAnimatedComponent's entire wiring (the
 * worklet-driven style never gets applied — the element just renders once with
 * whatever the initial snapshot happened to be, then never animates again).
 */
function looksLikeRealRNPrimitive(type: object): boolean {
  const t = (type as any).$$typeof;
  if (t !== undefined) return _forwardRefOrMemoType.has(t);
  return !!(type as any).prototype?.isReactComponent;
}

/**
 * Return the HTML tag to substitute for this component type on web.
 * For TextInput, checks props.multiline to decide between input and textarea.
 * Returns null when no substitution applies.
 */
export function getWebTag(type: unknown, props?: Record<string, unknown>): string | null {
  if (typeof type === 'string') return null;
  if (type === null || (typeof type !== 'function' && typeof type !== 'object')) return null;
  const obj = type as object;
  if (_userMap.has(obj)) return _userMap.get(obj)!;
  if (!looksLikeRealRNPrimitive(obj)) return null;

  const name: string | undefined = (obj as any).displayName ?? (obj as any).name;
  if (!name) {
    _cache.set(obj, null);
    return null;
  }

  // TextInput always substitutes; multiline → textarea
  if (name === 'TextInput') {
    const multiline = !!props && (props.multiline === true || Number(props.numberOfLines) > 1);
    return multiline ? 'textarea' : 'input';
  }

  if (_cache.has(obj)) return _cache.get(obj)!;
  const tag = _rnToHtml[name] ?? null;
  _cache.set(obj, tag);
  return tag;
}

// ─── Implied RN layout defaults ────────────────────────────────────────────────
//
// React Native's Yoga layout engine gives every node two defaults plain CSS
// doesn't: position:'relative' (so an absolutely-positioned child anchors to
// its nearest RN parent with zero extra classes) and, for View/ScrollView/
// SafeAreaView/etc., display:flex + flexDirection:'column'. Neither default is
// implied at the CSS-class level (core/resolvers/layout.ts) — a single shared
// `.flex-1 { }` rule can't vary per element, and forcing position/flex-direction
// there would break ordinary <div> usage elsewhere that relies on staying
// static/row. A component substituted FROM a real RN primitive (webTag truthy)
// is exactly the case where both native defaults ARE actually expected, since
// that's what the caller's original component meant.
//
// Without the position compensation: <View> wrapping an `absolute`-positioned
// child, with no explicit `relative` class (works on native for free — RN
// Views are always a positioning context), renders as a plain <div> on web —
// CSS defaults that div to position:'static', so the absolutely-positioned
// child escapes to the nearest ACTUALLY-positioned ancestor instead of this
// one, landing in the wrong place entirely rather than just looking slightly off.
//
// Returns a compensation object to merge into the element's inline style (or
// undefined if nothing needs adding) — never mutates resolvedBase. Callers
// merge it so the user's own explicit style/classes always win on conflict.
export function getImpliedRNStyle(
  webTag: string | null,
  resolvedBase: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!webTag || !resolvedBase) return undefined;

  const compensation: Record<string, string> = {};

  if (resolvedBase.position === undefined) compensation.position = 'relative';

  const explicitDisplay = resolvedBase.display;
  // gap-x/gap-y/gap ('columnGap'/'rowGap'/'gap') are exactly as meaningless
  // without display:flex as flexGrow/flexShrink/flex are — a plain <View
  // className="gap-2"> (no flex-row/items-*/etc. alongside it, relying purely
  // on View's native "always flex" default for spacing between children) is
  // the single most common way this is actually written, and was a complete
  // no-op on web without this. Not folded into the CSS-class-level fix above
  // (core/resolvers/layout.ts's items-center etc.) for the same reason flex-1
  // wasn't: forcing display:flex onto gap's own shared `.gap-2 { }` rule would
  // fight a `grid gap-2` combo in plain @kbach/react web usage (gap and grid
  // land in different CSS rule-generation groups — see vite-plugin.ts's
  // GROUPS — so whichever rule is emitted later in the stylesheet would win
  // regardless of which the caller actually wrote first).
  const hasFlexItemProps = 'flexGrow' in resolvedBase || 'flexShrink' in resolvedBase || 'flex' in resolvedBase
    || 'gap' in resolvedBase || 'columnGap' in resolvedBase || 'rowGap' in resolvedBase;
  // Already flex (e.g. items-center already set it), or would become flex via
  // this same compensation (flex-1, gap-2, etc.), and nothing already opted
  // OUT with an explicit non-flex display like `block`.
  const willBeFlex = explicitDisplay === 'flex' || (explicitDisplay === undefined && hasFlexItemProps);
  if (willBeFlex) {
    if (explicitDisplay === undefined) compensation.display = 'flex';
    if (resolvedBase.flexDirection === undefined) compensation.flexDirection = 'column';
  }

  return Object.keys(compensation).length > 0 ? compensation : undefined;
}

// ─── Prop transformation ──────────────────────────────────────────────────────

// RN-specific props with no HTML equivalent — drop to avoid React DOM warnings.
const _rnOnlyProps = new Set([
  // Interaction
  'onLongPress', 'delayLongPress',
  'activeOpacity', 'underlayColor',
  'hitSlop', 'pressRetentionOffset',
  'android_ripple', 'android_disableSound',
  'onHoverIn', 'onHoverOut', 'onHoverStart', 'onHoverEnd',
  // Layout event
  'onLayout',
  // Accessibility
  'accessible', 'accessibilityState', 'accessibilityLiveRegion',
  'importantForAccessibility',
  // Platform
  'nativeID', 'collapsable',
  'needsOffscreenAlphaCompositing', 'renderToHardwareTextureAndroid', 'shouldRasterizeIOS',
  'focusable', 'hasTVPreferredFocus',
  // 'pointerEvents' is handled in transformToWebProps (mapped to CSS style)
  // Text
  'selectable',
  'allowFontScaling', 'adjustsFontSizeToFit', 'minimumFontScale',
  'ellipsizeMode', 'numberOfLines',
  'onTextLayout', 'textBreakStrategy', 'lineBreakStrategyIOS',
  // TextInput
  'multiline',
  // NOTE: 'resizeMode' (Image's prop, not TextInput's) deliberately does NOT
  // go here — it's handled below in the isImage branch (mapped to CSS
  // object-fit). Blacklisting it here would make that branch unreachable.
  'blurOnSubmit', 'clearButtonMode', 'clearTextOnFocus', 'enablesReturnKeyAutomatically',
  'returnKeyType', 'spellCheck',
  // ScrollView
  'scrollEnabled',
  'showsVerticalScrollIndicator', 'showsHorizontalScrollIndicator',
  'contentContainerStyle',
  // 'horizontal' is handled in transformToWebProps (converted to CSS overflow-x).
  'keyboardShouldPersistTaps', 'keyboardDismissMode',
  'pagingEnabled', 'scrollEventThrottle', 'decelerationRate',
  'bounces', 'alwaysBounceHorizontal', 'alwaysBounceVertical',
  'snapToAlignment', 'snapToInterval', 'snapToOffsets',
  'removeClippedSubviews', 'overScrollMode',
  'stickyHeaderIndices', 'invertStickyHeaders',
  'onScrollBeginDrag', 'onScrollEndDrag',
  'onMomentumScrollBegin', 'onMomentumScrollEnd',
  'contentInset', 'contentInsetAdjustmentBehavior',
  'automaticallyAdjustContentInsets', 'automaticallyAdjustsScrollIndicatorInsets',
  // expo-image
  'contentPosition', 'cachePolicy', 'recyclingKey',
  'blurRadius', 'fadeDuration', 'responsivePolicy',
  'tintColor', 'allowDownscaling', 'placeholderContentFit',
  // FlatList / SectionList
  'data', 'renderItem', 'keyExtractor',
  'getItemLayout', 'initialScrollIndex',
  'initialNumToRender', 'maxToRenderPerBatch',
  'windowSize', 'updateCellsBatchingPeriod',
  'onEndReached', 'onEndReachedThreshold',
  'ListHeaderComponent', 'ListFooterComponent',
  'ListEmptyComponent', 'ListHeaderComponentStyle', 'ListFooterComponentStyle',
  'ItemSeparatorComponent', 'SectionSeparatorComponent',
  'inverted', 'getItem', 'getItemCount',
]);

const _pressableNames = new Set([
  'Pressable', 'TouchableOpacity', 'TouchableHighlight',
  'TouchableWithoutFeedback', 'TouchableNativeFeedback',
]);

const _keyboardTypeMap: Record<string, string> = {
  'numeric': 'number',
  'number-pad': 'number',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  'phone-pad': 'tel',
  'url': 'url',
};

const _resizeModeMap: Record<string, string> = {
  'contain': 'contain',
  'cover': 'cover',
  'stretch': 'fill',
  'center': 'none',
  'repeat': 'none',
};

/**
 * Remap React Native-specific props to their web equivalents.
 * Called when a component has been substituted with an HTML element.
 */
export function transformToWebProps(
  originalName: string,
  tag: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const isPressable = _pressableNames.has(originalName);
  const isTextInput = originalName === 'TextInput';
  const isImage = originalName === 'Image' || originalName === 'ImageBackground';
  const isScrollable = originalName === 'ScrollView' || originalName === 'FlatList' || originalName === 'SectionList';
  let pendingStyle: Record<string, unknown> | null = null;

  for (const [k, v] of Object.entries(props)) {
    if (_rnOnlyProps.has(k)) continue;

    if (k === 'onPress') {
      if (!('onClick' in props)) out.onClick = v;
      continue;
    }
    if (k === 'accessibilityLabel') { if (out['aria-label'] == null) out['aria-label'] = v; continue; }
    if (k === 'accessibilityRole') { if (out.role == null) out.role = v; continue; }
    if (k === 'testID') { if (out['data-testid'] == null) out['data-testid'] = v; continue; }

    // TextInput-specific
    if (isTextInput) {
      if (k === 'onChangeText') {
        if (!('onChange' in props)) out.onChange = (e: any) => (v as any)(e.target.value);
        continue;
      }
      if (k === 'secureTextEntry') {
        if (v && !('type' in props)) out.type = 'password';
        continue;
      }
      if (k === 'keyboardType') {
        if (!('type' in props) && !props.secureTextEntry) {
          const mapped = _keyboardTypeMap[v as string];
          if (mapped) out.type = mapped;
        }
        continue;
      }
      if (k === 'editable') { if (v === false) out.readOnly = true; continue; }
      if (k === 'maxLength') { out.maxLength = v; continue; }
    }

    // ScrollView: horizontal={true} → CSS overflow-x: auto + flex-direction: row
    // Collected as pendingStyle and merged after the loop so it doesn't get overwritten
    // when the style prop is processed later in the iteration.
    if (isScrollable && k === 'horizontal') {
      if (v) pendingStyle = { ...(pendingStyle ?? {}), display: 'flex', flexDirection: 'row', overflowX: 'auto' };
      continue;
    }

    // RN pointerEvents → CSS style.pointerEvents (only 'none' and 'auto' have direct equivalents)
    if (k === 'pointerEvents') {
      if (v === 'none' || v === 'auto') pendingStyle = { ...(pendingStyle ?? {}), pointerEvents: v };
      continue;
    }

    // Image-specific
    if (isImage) {
      if (k === 'source') {
        if (typeof v === 'string') {
          // Plain URL string (expo-image supports this)
          out.src = v;
        } else if (v && typeof v === 'object' && 'uri' in (v as any)) {
          out.src = (v as any).uri;
          if ((v as any).headers) out['crossOrigin'] = 'anonymous';
        }
        // number (require()) — skip, no URL available on web without asset server
        continue;
      }
      if (k === 'resizeMode') {
        // Collected as pendingStyle (like horizontal/pointerEvents above) so a
        // `style` prop encountered later in iteration order merges with this
        // instead of overwriting it outright.
        pendingStyle = { ...(pendingStyle ?? {}), objectFit: _resizeModeMap[v as string] ?? 'cover' };
        continue;
      }
      if (k === 'contentFit') {
        // expo-image prop: same values as CSS object-fit (cover, contain, fill, none, scale-down)
        pendingStyle = { ...(pendingStyle ?? {}), objectFit: v };
        continue;
      }
      // alt is valid HTML — let it pass through. defaultSource has no web equivalent.
      if (k === 'defaultSource') continue;
    }

    // React Native style arrays must be flattened for DOM elements.
    if (k === 'style') {
      if (Array.isArray(v)) {
        out.style = Object.assign({}, ...(v as object[]).filter(Boolean));
      } else if (v != null) {
        out.style = v;
      }
      continue;
    }

    out[k] = v;
  }

  // Merge pending style changes (horizontal, pointerEvents) — user style wins
  if (pendingStyle) {
    out.style = out.style
      ? { ...pendingStyle, ...(out.style as object) }
      : pendingStyle;
  }

  if (isPressable && !out.role) out.role = 'button';

  // img: alt is required for accessibility — default to empty string
  if (isImage && tag === 'img' && out.alt == null) out.alt = '';

  return out;
}
