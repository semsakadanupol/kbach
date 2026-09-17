/**
 * Ambient module augmentation adding `className?: string` to React
 * Native's own component prop types — without this, `<View
 * className="...">` type-checks fine at RUNTIME (the babel plugin/
 * jsx-runtime accept `className` on ANY host element regardless of its
 * declared prop type — see jsxRuntimeCore.ts's own `processElement` doc
 * comment) but fails `tsc`/editor type-checking, since `ViewProps`/
 * `TextProps`/etc. (react-native's own types) have no `className` field at
 * all. Confirmed as a real, reported gap: nothing in this package shipped
 * this augmentation before, so a React Native CLI project running `tsc`
 * (or just seeing red squiggles in-editor) hit "Property 'className' does
 * not exist on type ... ViewProps ..." on every styled element.
 *
 * A plain `.d.ts` file has no effect on its own unless something actually
 * pulls it into a consumer's type-checking. A side-effect `import
 * './rnClassNameTypes'` from index.ts was the first thing tried here, but
 * tsup's dts rollup (rollup-plugin-dts) tree-shakes a side-effect-only
 * import with nothing it can trace a type reference through — confirmed by
 * hand that this wasn't even consistent (survived one build, silently
 * vanished from an immediately-following clean rebuild of the identical
 * source). `scripts/append-classname-types.mjs` appends this file's own
 * text onto the end of the built `dist/index.d.ts`/`dist/index.web.d.ts`
 * directly as a deterministic post-build step instead — see that script's
 * own doc comment. Anyone who imports ANYTHING from '@kbach/react-native'
 * gets it with no extra tsconfig step needed either way. Same underlying
 * problem (and the interface-merge half of this fix) nativewind — a React
 * Native styling library solving this identical className-typing problem —
 * also has to solve.
 *
 * Every interface below is `export interface XProps extends Readonly<...>
 * {}` in react-native's own generated types (RN >= ~0.81's Flow-to-TS
 * generation, `types_generated/`) — an otherwise-empty body, so merging a
 * member in is exactly as safe as against a hand-written interface.
 * Deliberately NOT listed here: `ImageProps`, `TouchableOpacityProps`,
 * `ModalProps` — these are `export type X = Readonly<...>` TYPE ALIASES in
 * the same generated types, which TypeScript cannot declaration-merge into
 * at all (confirmed by hand: attempting it is a flat "Duplicate identifier"
 * compile error, not a silent no-op). They don't need an entry anyway —
 * confirmed against a real `tsc` run (RN 0.87) that `className` on
 * `Image`/`TouchableOpacity`/`TouchableHighlight`/`Modal`/`SafeAreaView`
 * ALL already type-check cleanly once `ViewProps` and
 * `TouchableWithoutFeedbackProps` below are augmented — each of those
 * components' real prop type composes one or the other somewhere in its
 * own `Omit<...> & ...` chain (`SafeAreaView` in particular turned out to
 * reuse `ViewProps` directly, with no separate props type of its own at
 * all), so the merged `className` field flows through without needing its
 * own dedicated entry.
 */
export {};

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface PressableProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface TouchableHighlightProps {
    className?: string;
  }
  interface TouchableWithoutFeedbackProps {
    className?: string;
  }
  interface SwitchProps {
    className?: string;
  }
  interface KeyboardAvoidingViewProps {
    className?: string;
  }
  interface FlatListProps<ItemT> {
    className?: string;
  }
  interface SectionListProps<ItemT, SectionT> {
    className?: string;
  }
}
