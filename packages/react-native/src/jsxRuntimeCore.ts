/**
 * Shared className-interception logic behind both jsx-runtime.tsx (native)
 * and jsx-runtime.web.tsx (Expo Web / react-native-web) — see either
 * file's own doc comment for why there have to be two separate entry
 * files at all (short version: @kbach/react-native ships pre-built dist/
 * output, and Metro's `.web.js` platform-extension resolution only swaps
 * between two already-built sibling files, not source-level imports a
 * single tsup/esbuild build already flattened away). This file holds
 * every bit of interception behavior that's IDENTICAL between the two —
 * only which `resolveStyle` implementation gets called differs, injected
 * by the caller via `createJsxFunctions`.
 */
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Fragment } from 'react';
import { Pressable } from 'react-native';
import type { ReactElement } from 'react';
import type { PressableStateCallbackType } from 'react-native';
import type { StyleObject } from './nativeBridge';
import { getGlobalDarkMode } from './darkModeStore';

export { Fragment };
export type { JSX } from 'react';

export type ResolveStyleFn = (classString: string, pressed?: boolean) => StyleObject;

function makeElement(
  isStaticChildren: boolean,
  type: unknown,
  props: Record<string, unknown>,
  key: string | undefined,
): ReactElement {
  return (isStaticChildren ? _jsxs : _jsx)(type as any, props as any, key) as ReactElement;
}

/** Resolves `classStrRaw` for a given press state and merges in `userStyle`. */
function resolvedStyleFor(resolveStyle: ResolveStyleFn, classStrRaw: string, userStyle: unknown, pressed: boolean): unknown {
  const resolved = resolveStyle(classStrRaw, pressed);
  if (userStyle === undefined) {
    return resolved;
  }
  if (typeof userStyle === 'function') {
    return [resolved, (userStyle as (state: PressableStateCallbackType) => unknown)({ pressed })];
  }
  return [resolved, userStyle];
}

const DARK_MODIFIER_RE = /(^|\s)dark:/;

/**
 * A `dark:`-bearing element needs a key suffix that changes whenever the
 * global dark-mode state does — confirmed by hand against a real Expo Go
 * app: toggling dark mode re-renders the component that calls `useTheme()`
 * (so a value it reads directly, like `mode`, updates on screen correctly)
 * and `resolveStyle` genuinely returns the new colors on that re-render —
 * but React Native's own reconciler doesn't repaint an ALREADY-MOUNTED host
 * component (View/Text/Pressable) just because its `style` prop holds new
 * VALUES; forcing a remount via a changed `key` is what actually made the
 * new colors show. Scoped to elements whose className literally contains
 * "dark:" (a cheap regex test) rather than applied unconditionally, so an
 * element with no mode-dependent styling never remounts for no reason.
 * `sm:`/`md:`/etc. likely have the identical underlying issue (same "a live
 * JS parameter, no React state, no built-in re-render-triggers-repaint
 * guarantee" shape as dark: — see nativeBridge.ts's own width parameter
 * doc comment) but haven't been confirmed broken the same way, so this
 * deliberately stays scoped to dark: for now rather than guessing at a fix
 * for an unconfirmed problem.
 */
function darkModeKeySuffix(classStrRaw: string): string {
  return DARK_MODIFIER_RE.test(classStrRaw) ? `:kb-dark-${getGlobalDarkMode()}` : '';
}

function processElement(
  resolveStyle: ResolveStyleFn,
  type: unknown,
  rawProps: Record<string, unknown> | null,
  key: string | undefined,
  isStaticChildren: boolean,
): ReactElement {
  if (type === null || typeof type === 'symbol' || !rawProps) {
    return makeElement(isStaticChildren, type, rawProps ?? {}, key);
  }

  const { className: classStrRaw, style: userStyle, ...rest } = rawProps;

  // Not a plain string (undefined, or a function-valued className some
  // third-party component might use its own way) — not ours to resolve.
  if (typeof classStrRaw !== 'string') {
    return makeElement(isStaticChildren, type, rawProps, key);
  }

  // Pressable is the one component that knows press state at all — style
  // becomes a function so active: can react to it. Every other type keeps
  // the plain, static resolution it always had (pressed is always false).
  const finalStyle =
    type === Pressable
      ? (state: PressableStateCallbackType) => resolvedStyleFor(resolveStyle, classStrRaw, userStyle, state.pressed)
      : resolvedStyleFor(resolveStyle, classStrRaw, userStyle, false);

  const suffix = darkModeKeySuffix(classStrRaw);
  const finalKey = suffix ? `${key ?? ''}${suffix}` : key;

  return makeElement(isStaticChildren, type, { ...rest, style: finalStyle }, finalKey);
}

/**
 * `active:` needs different handling from every other modifier: whether an
 * element is "pressed" isn't a value that can be read once and reused like
 * `dark:`'s color scheme — only RN's `Pressable` ever knows it, and only
 * via a style FUNCTION it calls on every press/release
 * (`style={({pressed}) => ...}`). So for `type === Pressable` specifically,
 * `style` is built as a function instead of a static value; every other
 * element type is completely unaffected by this — same code path as before.
 */
export function createJsxFunctions(resolveStyle: ResolveStyleFn) {
  function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
    return processElement(resolveStyle, type, props, key, false);
  }

  function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
    return processElement(resolveStyle, type, props, key, true);
  }

  return { jsx, jsxs };
}

/**
 * Shared jsxDEV behavior behind jsx-dev-runtime.tsx/jsx-dev-runtime.web.tsx
 * — Metro calls jsxDEV instead of jsx/jsxs in dev builds. Reuses whichever
 * platform's jsx/jsxs pair is passed in for the actual interception, then
 * patches _source/_self onto the result so React DevTools shows the
 * original file/line.
 */
type JsxFn = (type: unknown, props: Record<string, unknown> | null, key?: string) => ReactElement;

export function createJsxDEV(jsx: JsxFn, jsxs: JsxFn) {
  return function jsxDEV(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string,
    isStaticChildren?: boolean,
    source?: { fileName: string; lineNumber: number; columnNumber: number },
    self?: unknown,
  ): ReactElement {
    const element = (isStaticChildren ? jsxs : jsx)(type, props, key);

    // React's dev JSX runtime freezes the returned element (and no longer
    // even defines _source/_self as of React 19) — only patch when the
    // object is still extensible. Same React-19 compatibility note as
    // @kbach/react/jsx-dev-runtime.
    if (source && element && typeof element === 'object' && Object.isExtensible(element)) {
      (element as any)._source = source;
      (element as any)._self = self;
    }

    return element;
  };
}
