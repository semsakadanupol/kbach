import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import * as React from 'react';
import TestRenderer from 'react-test-renderer';

/**
 * 'react-native' is MOCKED here, not imported for real — necessary, not
 * just a style choice. Its own real entry file uses Flow's `import typeof
 * * as X from './index.js.flow'` syntax, which isn't valid JS/TS at all;
 * Vite's SSR transform only ever needs to actually parse that file when a
 * named import from 'react-native' is REFERENCED as a value somewhere
 * (confirmed by direct bisection — merely importing-and-not-using one is
 * fine), which `semanticElements.tsx` necessarily does (`Pressable`/`Text`
 * are both JSX tags there). Every other test in this package that touches
 * 'react-native' at all (see ThemeProvider.test.tsx's own `mockAppearance`)
 * already avoids this the same way — this is that same established
 * pattern, not a new one.
 */
function mockReactNative(): void {
  vi.doMock('react-native', () => ({
    Pressable: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('Pressable', { ...props, ref }),
    ),
    Text: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('Text', { ...props, ref }),
    ),
  }));
}

function render(element: React.ReactElement) {
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}

describe('semantic elements', () => {
  beforeEach(() => {
    vi.resetModules();
    mockReactNative();
  });

  it('Button renders a Pressable with accessibilityRole="button"', async () => {
    const { Pressable } = await import('react-native');
    const { Button } = await import('./semanticElements');
    const renderer = render(React.createElement(Button, { onPress: () => {}, className: 'px-4' }));
    const pressable = renderer.root.findByType(Pressable as React.ComponentType);
    expect(pressable.props.accessibilityRole).toBe('button');
    expect(pressable.props.className).toBe('px-4');
  });

  it("Button lets a caller's own accessibilityRole override the default", async () => {
    const { Pressable } = await import('react-native');
    const { Button } = await import('./semanticElements');
    const renderer = render(React.createElement(Button, { onPress: () => {}, accessibilityRole: 'link' }));
    expect(renderer.root.findByType(Pressable as React.ComponentType).props.accessibilityRole).toBe('link');
  });

  it('Paragraph renders a Text with role="paragraph"', async () => {
    const { Text } = await import('react-native');
    const { Paragraph } = await import('./semanticElements');
    const renderer = render(React.createElement(Paragraph, { className: 'text-sm' }, 'Hello'));
    const text = renderer.root.findByType(Text as React.ComponentType);
    expect(text.props.role).toBe('paragraph');
    expect(text.props.className).toBe('text-sm');
    expect(text.props.children).toBe('Hello');
  });

  it('H1..H6 each render a Text with accessibilityRole="header" and the matching aria-level', async () => {
    const { Text } = await import('react-native');
    const { H1, H2, H3, H4, H5, H6 } = await import('./semanticElements');
    const headings = [H1, H2, H3, H4, H5, H6];
    for (let i = 0; i < headings.length; i++) {
      const renderer = render(React.createElement(headings[i]!, {}, 'Title'));
      const text = renderer.root.findByType(Text as React.ComponentType);
      expect(text.props.accessibilityRole).toBe('header');
      expect(text.props['aria-level']).toBe(i + 1);
    }
  });

  it("a heading's own props win over the pre-set defaults", async () => {
    // Matches every other wrapper here: the pre-set role/level is a
    // DEFAULT, not a lock — `{...extra} {...props}` always spreads the
    // caller's own props last.
    const { Text } = await import('react-native');
    const { H2 } = await import('./semanticElements');
    const renderer = render(React.createElement(H2, { accessibilityRole: 'none' }, 'Title'));
    expect(renderer.root.findByType(Text as React.ComponentType).props.accessibilityRole).toBe('none');
  });
});
