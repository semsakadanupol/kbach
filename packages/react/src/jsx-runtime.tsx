/**
 * @kbach/react/jsx-runtime
 *
 * Drop-in replacement for react/jsx-runtime. Intercepts the `className` prop
 * on EVERY JSX element and resolves it through `kb()` — same resolve+inject
 * logic `kb()` already uses when called explicitly, just applied
 * automatically per element instead of per call site.
 *
 * No InteractiveWrapper/DarkWrapper equivalent (unlike old-kbach's version)
 * — this engine is web-only, and packages/core-engine's css.rs already
 * emits real :hover/@media/[data-theme] CSS the browser handles natively
 * once the rule is injected. Nothing here needs to re-render on hover,
 * focus, dark-mode, or viewport changes.
 */

import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { Fragment } from 'react';
import type { ReactElement } from 'react';
import { kb } from './kb';

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

function processElement(
  type: unknown,
  rawProps: Record<string, unknown> | null,
  key: string | undefined,
  isStaticChildren: boolean,
): ReactElement {
  // Fragments/portals (symbol types) and null carry no interceptable props.
  if (type === null || typeof type === 'symbol' || !rawProps) {
    return makeElement(isStaticChildren, type, rawProps ?? {}, key);
  }

  const { className: classStrRaw, ...rest } = rawProps;

  // className isn't always a plain string — third-party components can
  // declare their own contract for it (e.g. react-router's <NavLink
  // className={({isActive}) => '...'}>). Only a literal string is ours to
  // resolve; anything else (undefined, a function, ...) is forwarded as-is.
  if (typeof classStrRaw !== 'string') {
    return makeElement(isStaticChildren, type, rawProps, key);
  }

  return makeElement(isStaticChildren, type, { ...rest, className: kb(classStrRaw) }, key);
}

export function jsx(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, false);
}

export function jsxs(type: unknown, props: Record<string, unknown> | null, key?: string): ReactElement {
  return processElement(type, props, key, true);
}
