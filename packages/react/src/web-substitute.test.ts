import { describe, it, expect } from 'vitest';
import { transformToWebProps, getWebTag, getImpliedRNStyle, registerWebElement } from './web-substitute';

// Regression coverage for a fixed bug: the `horizontal` branch did a full
// `pendingStyle = { ... }` overwrite instead of merging, unlike its sibling
// branches (pointerEvents, resizeMode, contentFit) in the same function. A
// <ScrollView horizontal pointerEvents="none"> substituted to web would
// silently lose whichever of the two props got processed first, depending
// on Object.entries() iteration order.

describe('transformToWebProps — ScrollView horizontal + pointerEvents merge', () => {
  it('merges pointerEvents (processed first) with horizontal (processed second)', () => {
    const out = transformToWebProps('ScrollView', 'div', { pointerEvents: 'none', horizontal: true });
    expect(out.style).toEqual({
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'row',
      overflowX: 'auto',
    });
  });

  it('merges horizontal (processed first) with pointerEvents (processed second)', () => {
    const out = transformToWebProps('ScrollView', 'div', { horizontal: true, pointerEvents: 'auto' });
    expect(out.style).toEqual({
      display: 'flex',
      flexDirection: 'row',
      overflowX: 'auto',
      pointerEvents: 'auto',
    });
  });

  it('lets an explicit user style prop win over the horizontal/pointerEvents compensation', () => {
    const out = transformToWebProps('ScrollView', 'div', {
      horizontal: true,
      pointerEvents: 'none',
      style: { overflowX: 'hidden' },
    });
    expect(out.style).toEqual({
      display: 'flex',
      flexDirection: 'row',
      pointerEvents: 'none',
      overflowX: 'hidden', // user value overrides the compensation default
    });
  });

  it('does not apply horizontal compensation when horizontal is falsy', () => {
    const out = transformToWebProps('ScrollView', 'div', { horizontal: false, pointerEvents: 'none' });
    expect(out.style).toEqual({ pointerEvents: 'none' });
  });
});

// A real RN primitive (View, Text, Pressable, …) is forwardRef/memo-wrapped in
// both react-native and react-native-web — fake that shape rather than a plain
// object, since getWebTag()'s whole point is telling that apart from a plain
// function component that merely shares the same name (see looksLikeRealRNPrimitive).
function fakeForwardRefPrimitive(name: string): object {
  return { $$typeof: Symbol.for('react.forward_ref'), displayName: name };
}

describe('getWebTag', () => {
  it('substitutes a real RN primitive by name', () => {
    expect(getWebTag(fakeForwardRefPrimitive('View'))).toBe('div');
    expect(getWebTag(fakeForwardRefPrimitive('Text'))).toBe('span');
    expect(getWebTag(fakeForwardRefPrimitive('Pressable'))).toBe('div');
  });

  it('returns null for a string type (already an HTML tag, nothing to substitute)', () => {
    expect(getWebTag('div')).toBeNull();
  });

  it('returns null for a plain function component that merely shares an RN primitive\'s name', () => {
    // The Animated.View regression: react-native-reanimated's createAnimatedComponent()
    // re-borrows the wrapped component's name but is a plain arrow function underneath —
    // no $$typeof, no prototype.isReactComponent — structurally indistinguishable from a
    // user's own "View"-named component without the forwardRef/memo/class check.
    function FakeAnimatedView() {}
    Object.defineProperty(FakeAnimatedView, 'name', { value: 'View' });
    expect(getWebTag(FakeAnimatedView)).toBeNull();
  });

  it('substitutes a class component (e.g. FlatList/SectionList) via prototype.isReactComponent', () => {
    class FakeSectionList {}
    (FakeSectionList.prototype as any).isReactComponent = {};
    Object.defineProperty(FakeSectionList, 'name', { value: 'SectionList' });
    expect(getWebTag(FakeSectionList)).toBe('div');
  });

  it('returns null for an unrecognized RN primitive name', () => {
    expect(getWebTag(fakeForwardRefPrimitive('NotARealPrimitive'))).toBeNull();
  });

  it('TextInput substitutes to "input" by default, "textarea" when multiline', () => {
    const textInput = fakeForwardRefPrimitive('TextInput');
    expect(getWebTag(textInput)).toBe('input');
    expect(getWebTag(textInput, { multiline: true })).toBe('textarea');
    expect(getWebTag(textInput, { numberOfLines: 3 })).toBe('textarea');
  });

  it('registerWebElement() lets a user register a custom component for substitution', () => {
    const CustomComponent = {};
    expect(getWebTag(CustomComponent)).toBeNull();
    registerWebElement(CustomComponent, 'custom-tag');
    expect(getWebTag(CustomComponent)).toBe('custom-tag');
  });
});

describe('getImpliedRNStyle', () => {
  it('returns undefined when there is no webTag (nothing was substituted)', () => {
    expect(getImpliedRNStyle(null, {})).toBeUndefined();
  });

  it('returns undefined when resolvedBase is undefined', () => {
    expect(getImpliedRNStyle('div', undefined)).toBeUndefined();
  });

  it('adds position:relative when nothing already set a position', () => {
    expect(getImpliedRNStyle('div', {})).toEqual({ position: 'relative' });
  });

  it('does not override an explicit position (and returns undefined, not {}, when nothing needs compensating)', () => {
    expect(getImpliedRNStyle('div', { position: 'absolute' })).toBeUndefined();
  });

  it('adds display:flex + flexDirection:column when a flex-item prop is present with no explicit display', () => {
    expect(getImpliedRNStyle('div', { flex: 1 })).toEqual({ position: 'relative', display: 'flex', flexDirection: 'column' });
    expect(getImpliedRNStyle('div', { gap: 8 })).toEqual({ position: 'relative', display: 'flex', flexDirection: 'column' });
  });

  it('does not force flexDirection when display:flex is already explicit but flexDirection is too', () => {
    expect(getImpliedRNStyle('div', { display: 'flex', flexDirection: 'row' })).toEqual({ position: 'relative' });
  });

  it('does not add flex compensation when an explicit non-flex display opts out', () => {
    expect(getImpliedRNStyle('div', { display: 'block', flex: 1 })).toEqual({ position: 'relative' });
  });

  it('returns undefined (not an empty object) when nothing needs compensating', () => {
    expect(getImpliedRNStyle('div', { position: 'absolute', display: 'block' })).toBeUndefined();
  });
});

describe('transformToWebProps — common prop mapping', () => {
  it('maps onPress to onClick unless onClick is already provided', () => {
    const onPress = () => {};
    expect(transformToWebProps('Pressable', 'div', { onPress }).onClick).toBe(onPress);
    const onClick = () => {};
    expect(transformToWebProps('Pressable', 'div', { onPress, onClick }).onClick).toBe(onClick);
  });

  it('maps accessibility/test props to their DOM/ARIA equivalents', () => {
    const out = transformToWebProps('View', 'div', {
      accessibilityLabel: 'a label', accessibilityRole: 'button', testID: 'my-id',
    });
    expect(out).toMatchObject({ 'aria-label': 'a label', role: 'button', 'data-testid': 'my-id' });
  });

  it('drops RN-only props with no web equivalent', () => {
    const out = transformToWebProps('View', 'div', { onLayout: () => {}, hitSlop: 10, collapsable: false });
    expect(out).toEqual({});
  });

  it('defaults role to "button" for pressable components', () => {
    expect(transformToWebProps('Pressable', 'div', {}).role).toBe('button');
  });

  it('flattens an RN style array into one merged object', () => {
    const out = transformToWebProps('View', 'div', { style: [{ padding: 4 }, { margin: 8 }] });
    expect(out.style).toEqual({ padding: 4, margin: 8 });
  });
});

describe('transformToWebProps — TextInput', () => {
  it('maps onChangeText to onChange, extracting e.target.value', () => {
    const received: string[] = [];
    const out = transformToWebProps('TextInput', 'input', { onChangeText: (v: string) => received.push(v) });
    (out.onChange as (e: unknown) => void)({ target: { value: 'hello' } });
    expect(received).toEqual(['hello']);
  });

  it('sets type=password for secureTextEntry, unless an explicit type is already provided', () => {
    expect(transformToWebProps('TextInput', 'input', { secureTextEntry: true }).type).toBe('password');
    expect(transformToWebProps('TextInput', 'input', { secureTextEntry: true, type: 'text' }).type).toBe('text');
  });

  it('maps keyboardType to an HTML input type', () => {
    expect(transformToWebProps('TextInput', 'input', { keyboardType: 'numeric' }).type).toBe('number');
    expect(transformToWebProps('TextInput', 'input', { keyboardType: 'email-address' }).type).toBe('email');
  });

  it('applies keyboardType when secureTextEntry is explicitly false (not just absent)', () => {
    // Regression: the presence check `'secureTextEntry' in props` used to block
    // this even though secureTextEntry itself is a no-op for a falsy value.
    expect(transformToWebProps('TextInput', 'input', { secureTextEntry: false, keyboardType: 'numeric' }).type).toBe('number');
  });

  it('maps editable:false to readOnly, and passes through maxLength', () => {
    expect(transformToWebProps('TextInput', 'input', { editable: false }).readOnly).toBe(true);
    expect(transformToWebProps('TextInput', 'input', { maxLength: 10 }).maxLength).toBe(10);
  });
});

describe('transformToWebProps — Image', () => {
  it('maps a source object with a uri to src', () => {
    expect(transformToWebProps('Image', 'img', { source: { uri: 'https://example.com/x.png' } }).src).toBe('https://example.com/x.png');
  });

  it('maps a plain string source to src (expo-image convention)', () => {
    expect(transformToWebProps('Image', 'img', { source: 'https://example.com/x.png' }).src).toBe('https://example.com/x.png');
  });

  it('sets crossOrigin when the source carries headers', () => {
    const out = transformToWebProps('Image', 'img', { source: { uri: 'x.png', headers: { Authorization: 'x' } } });
    expect(out.crossOrigin).toBe('anonymous');
  });

  it('maps resizeMode to CSS object-fit', () => {
    const out = transformToWebProps('Image', 'img', { resizeMode: 'stretch' });
    expect(out.style).toEqual({ objectFit: 'fill' });
  });

  it('maps contentFit directly (expo-image already uses object-fit values)', () => {
    const out = transformToWebProps('Image', 'img', { contentFit: 'contain' });
    expect(out.style).toEqual({ objectFit: 'contain' });
  });

  it('defaults alt to empty string for accessibility when not provided', () => {
    expect(transformToWebProps('Image', 'img', {}).alt).toBe('');
  });

  it('does not override an explicit alt', () => {
    expect(transformToWebProps('Image', 'img', { alt: 'a photo' }).alt).toBe('a photo');
  });
});
