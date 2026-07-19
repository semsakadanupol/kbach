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
  'resizeMode', // handled separately
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
        if (!('type' in props) && !('secureTextEntry' in props)) {
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
      if (v) pendingStyle = { display: 'flex', flexDirection: 'row', overflowX: 'auto' };
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
