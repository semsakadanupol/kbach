/**
 * @kbach/react-native/jsx-runtime
 *
 * Drop-in replacement for react/jsx-runtime — same interception shape as
 * @kbach/react/jsx-runtime (Phase 3), but the resolved value becomes the
 * `style` prop instead of `className`: View/Text have no `className` prop
 * at all. Covers layout, color, spacing, border, typography, dark:, and
 * active: (Pressable only) — see nativeBridge.ts / resolve_style.rs for
 * exactly what's resolved; every other modifier (hover:/responsive/...)
 * parses but isn't applied yet.
 *
 * `active:` needs different handling from every other modifier: whether an
 * element is "pressed" isn't a value that can be read once and reused like
 * `dark:`'s color scheme — only RN's `Pressable` ever knows it, and only
 * via a style FUNCTION it calls on every press/release
 * (`style={({pressed}) => ...}`). So for `type === Pressable` specifically,
 * `style` is built as a function instead of a static value; every other
 * element type is completely unaffected by this — same code path as before.
 */

import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Fragment } from 'react';
import { Pressable } from 'react-native';
import type { ReactElement } from 'react';
import type { PressableStateCallbackType } from 'react-native';
import { resolveStyle } from './nativeBridge';

export { Fragment };
export type { JSX } from 'react';

function makeElement(
  isStaticChildren: boolean,
  type: unknown,
  props: Record<string, unknown>,
  key: string | undefined,
): ReactElement {
  return (isStaticChildren ? _jsxs : _jsx)(type as any, props as any, key) as ReactElement;
}

/** Resolves `classStrRaw` for a given press state and merges in `userStyle`. */
function resolvedStyleFor(classStrRaw: string, userStyle: unknown, pressed: boolean): unknown {
  const resolved = resolveStyle(classStrRaw, pressed);
  if (userStyle === undefined) {
    return resolved;
  }
  if (typeof userStyle === 'function') {
    return [resolved, (userStyle as (state: PressableStateCallbackType) => unknown)({ pressed })];
  }
  return [resolved, userStyle];
}

function processElement(
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
      ? (state: PressableStateCallbackType) => resolvedStyleFor(classStrRaw, userStyle, state.pressed)
      : resolvedStyleFor(classStrRaw, userStyle, false);

  return makeElement(isStaticChildren, type, { ...rest, style: finalStyle }, key);
}

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, false);
}

export function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, true);
}
