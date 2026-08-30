/**
 * Web sibling of jsxRuntimeCore.ts — shared className-interception logic
 * behind jsx-runtime.web.tsx/jsx-dev-runtime.web.tsx. Genuinely different
 * from the native core, not just a thin variant: native resolves a class
 * string to a `style` object (dark:/active:/responsive gated by a live JS
 * parameter this module has to compute), while web resolves it to real
 * injected CSS and a `dataSet` prop instead (every modifier the browser's
 * own CSS engine understands, evaluated by the browser itself) — see
 * nativeBridge.web.ts's own doc comment for the full reasoning. `createJsxDEV`
 * from jsxRuntimeCore.ts is still reused as-is by jsx-dev-runtime.web.tsx
 * (it's generic over any jsx/jsxs function shape, nothing native-specific
 * about it) — only the className-resolution half needed a web-specific
 * rewrite.
 *
 * No Pressable-specific handling here (unlike jsxRuntimeCore.ts's
 * `processElement`) — real CSS `:active` fires on any DOM element via the
 * browser's own mouse/touch handling, so `active:` needs no `pressed`
 * state read out of Pressable's style-function callback the way native
 * does; every element type is treated identically.
 */
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Fragment } from 'react';
import type { ReactElement } from 'react';

export { Fragment };
export type { JSX } from 'react';

export type ResolveClassNameFn = (classString: string) => string;

function makeElement(
  isStaticChildren: boolean,
  type: unknown,
  props: Record<string, unknown>,
  key: string | undefined,
): ReactElement {
  return (isStaticChildren ? _jsxs : _jsx)(type as any, props as any, key) as ReactElement;
}

function processElement(
  resolveClassName: ResolveClassNameFn,
  type: unknown,
  rawProps: Record<string, unknown> | null,
  key: string | undefined,
  isStaticChildren: boolean,
): ReactElement {
  if (type === null || typeof type === 'symbol' || !rawProps) {
    return makeElement(isStaticChildren, type, rawProps ?? {}, key);
  }

  const { className: classStrRaw, dataSet: userDataSet, ...rest } = rawProps;

  // Not a plain string (undefined, or a function-valued className some
  // third-party component might use its own way) — not ours to resolve.
  if (typeof classStrRaw !== 'string') {
    return makeElement(isStaticChildren, type, rawProps, key);
  }

  const resolved = resolveClassName(classStrRaw);
  const dataSet = { ...(userDataSet as Record<string, unknown> | undefined), kb: resolved };

  // className goes back onto the outgoing props alongside dataSet — same
  // reasoning as jsxRuntimeCore.ts's native processElement: `type` can be
  // a real react-native-web host primitive (which only ever reads
  // dataSet.kb here, and ignores the extra className prop) or a custom
  // component you wrote (which needs className to actually arrive, or a
  // caller's classes on it silently vanish — see that file's doc comment
  // for the full native-side writeup of this same bug).
  return makeElement(isStaticChildren, type, { ...rest, className: classStrRaw, dataSet }, key);
}

export function createJsxFunctionsWeb(resolveClassName: ResolveClassNameFn) {
  function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
    return processElement(resolveClassName, type, props, key, false);
  }

  function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
    return processElement(resolveClassName, type, props, key, true);
  }

  return { jsx, jsxs };
}
