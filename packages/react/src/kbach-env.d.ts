/**
 * Kbach — global type augmentations
 *
 * Adds `className` and `kb` to every React Native component prop interface
 * so TypeScript accepts Kbach utility classes without casting.
 *
 * For projects using the published npm package, add one of:
 *   • tsconfig.json → "types": ["@kbach/react/types"]
 *   • Any .d.ts file → /// <reference types="@kbach/react/types" />
 *
 * For monorepo dev (test-app), this file is picked up automatically because
 * apps/test-app/tsconfig.json includes ../../packages/react/src.
 */

// export {} makes this file a module so declare module blocks are augmentations.
// Do NOT import 'react-native' here — that would break pure React web projects
// that don't have react-native installed.
export {};

declare module 'react-native' {
  // ─── Kbach style props ────────────────────────────────────────────────────
  interface KbachProps {
    /** Kbach utility class string, e.g. "bg-blue-500 dark:bg-blue-700 p-4" */
    className?: string;
    /** Alias for className */
    kb?: string;
  }

  // ─── Layout ──────────────────────────────────────────────────────────────
  interface ViewProps extends KbachProps {}
  interface ScrollViewProps extends KbachProps {}
  interface KeyboardAvoidingViewProps extends KbachProps {}
  interface SafeAreaViewProps extends KbachProps {}
  interface VirtualizedListProps<ItemT> extends KbachProps {}
  interface FlatListProps<ItemT> extends KbachProps {}
  interface SectionListProps<ItemT, SectionT> extends KbachProps {}

  // ─── Text & Input ─────────────────────────────────────────────────────────
  interface TextProps extends KbachProps {}
  interface TextInputProps extends KbachProps {}

  // ─── Media ───────────────────────────────────────────────────────────────
  interface ImageProps extends KbachProps {}
  interface ImageBackgroundProps extends KbachProps {}

  // ─── Interaction ──────────────────────────────────────────────────────────
  interface TouchableOpacityProps extends KbachProps {}
  interface TouchableHighlightProps extends KbachProps {}
  interface TouchableNativeFeedbackProps extends KbachProps {}
  interface TouchableWithoutFeedbackProps extends KbachProps {}
  interface PressableProps extends KbachProps {}

  // ─── Controls ─────────────────────────────────────────────────────────────
  interface SwitchProps extends KbachProps {}
  interface SliderProps extends KbachProps {}
  interface ActivityIndicatorProps extends KbachProps {}
  interface ProgressBarAndroidProps extends KbachProps {}

  // ─── Modals / Overlays ────────────────────────────────────────────────────
  interface ModalProps extends KbachProps {}
  interface DrawerLayoutAndroidProps extends KbachProps {}
}

// ─── Web HTML elements ────────────────────────────────────────────────────────
declare module 'react' {
  interface HTMLAttributes<T> {
    className?: string;
    kb?: string;
  }
}
