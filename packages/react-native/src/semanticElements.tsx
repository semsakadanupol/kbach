import * as React from 'react';
import { Pressable, Text } from 'react-native';
import type { PressableProps, TextProps } from 'react-native';

/**
 * On Expo Web, `react-native-web` renders a bare `<View>`/`<Text>` as a
 * plain `<div>`/`<span>` by default — confirmed directly in its own
 * source (`exports/View/index.js`, `exports/Text/index.js`). That's
 * NOTHING to do with Kbach: this package's jsx-runtime never reads or
 * substitutes the JSX element type at all (`processElement` in
 * `jsxRuntimeCore(.web).ts` only ever destructures `className`/`style`,
 * passing `type` straight through unchanged) — whatever tag shows up is
 * exactly whatever component the app wrote.
 *
 * `react-native-web` already has a real fix for this that nothing here
 * needs to add: an `accessibilityRole`/`role` prop on ANY host component
 * makes it render the matching real HTML element instead
 * (`propsToAccessibilityComponent`, react-native-web's own
 * AccessibilityUtil) — `button` -> `<button>`, `header` (+ `aria-level`,
 * web-only) -> `<h1>`-`<h6>`, `paragraph` -> `<p>`, and so on. These
 * components are JUST that prop, pre-set on the right underlying
 * component — nothing Kbach-specific, and writing
 * `<Pressable accessibilityRole="button">` directly instead of `<Button>`
 * behaves identically. `className` keeps working on every one of these
 * exactly like it does on a bare `Pressable`/`Text`.
 *
 * Deliberately NOT a `Div` or an `Input`: a plain `<View>` already IS the
 * right generic container (there's no more-semantic alternative to ask
 * for), and `<TextInput>` already renders a real `<input>` (or
 * `<textarea>` when `multiline`) by default — react-native-web's own
 * TextInput component picks that unconditionally, with no role needed at
 * all. Only the cases that actually need a role to stop defaulting to
 * `<div>`/`<span>` are here.
 */

export type ButtonProps = PressableProps;

/**
 * A real `<button>` on Expo Web, a real accessible button on native —
 * `<Pressable accessibilityRole="button">`, nothing else changed. Not the
 * same thing as React Native's OWN built-in `Button` (a fixed-chrome,
 * barely-styleable native control) — this is a styleable `Pressable`,
 * matching how every other interactive element in a Kbach app is built.
 */
// `ref`'s generic is `any`, not `React.ComponentRef<typeof Pressable>` —
// that real type resolves through RN's internal (non-exported)
// `ReactNativeElement`, which TS refuses to embed in this package's own
// `.d.ts` output ("cannot be named without a reference to
// ReactNativeElement... not portable", confirmed live). `any` here is
// scoped to exactly the ref parameter, not the whole component's props.
export const Button = React.forwardRef<any, ButtonProps>(function Button(props, ref) {
  return <Pressable ref={ref} accessibilityRole="button" {...props} />;
});

export type ParagraphProps = TextProps;

// `role="paragraph"` isn't in React Native's own typed `Role` union (it's
// an ARIA 1.2 "document structure" role react-native-web additionally
// supports — confirmed in its propsToAccessibilityComponent.js's own
// `roleComponents` map) — this cast is exactly that one gap, not a broad
// escape hatch, and only ever touches this single prop value.
const PARAGRAPH_ROLE = 'paragraph' as unknown as NonNullable<TextProps['role']>;

/** A real `<p>` on Expo Web — `<Text role="paragraph">`, nothing else changed. */
export const Paragraph = React.forwardRef<any, ParagraphProps>(function Paragraph(props, ref) {
  return <Text ref={ref} role={PARAGRAPH_ROLE} {...props} />;
});

export type HeadingProps = TextProps;

// `aria-level` has no React Native equivalent at all (grep confirms it
// isn't in react-native's own type definitions anywhere) — real native
// accessibility has no concept of a heading LEVEL, only `header` itself;
// this is purely a web/react-native-web hint for which of `<h1>`-`<h6>`
// to render (`propsToAccessibilityComponent.js`: `accessibilityLevel ||
// props['aria-level']`, defaulting to 1 when absent). Passed as a plain
// extra prop, cast narrowly (just this one key) since TextProps has no
// slot for it to type-check against.
function makeHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const extra = { 'aria-level': level } as unknown as Partial<TextProps>;
  // `any` ref generic — see `Button`'s own comment for why.
  const Heading = React.forwardRef<any, HeadingProps>(function Heading(props, ref) {
    return <Text ref={ref} accessibilityRole="header" {...extra} {...props} />;
  });
  Heading.displayName = `H${level}`;
  return Heading;
}

/** A real `<h1>` on Expo Web — `<Text accessibilityRole="header">` + the web-only level hint, nothing else changed. */
export const H1 = makeHeading(1);
/** A real `<h2>` on Expo Web — see `H1`'s own doc comment. */
export const H2 = makeHeading(2);
/** A real `<h3>` on Expo Web — see `H1`'s own doc comment. */
export const H3 = makeHeading(3);
/** A real `<h4>` on Expo Web — see `H1`'s own doc comment. */
export const H4 = makeHeading(4);
/** A real `<h5>` on Expo Web — see `H1`'s own doc comment. */
export const H5 = makeHeading(5);
/** A real `<h6>` on Expo Web — see `H1`'s own doc comment. */
export const H6 = makeHeading(6);
