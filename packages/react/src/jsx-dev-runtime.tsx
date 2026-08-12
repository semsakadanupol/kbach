/**
 * @kbach/react/jsx-dev-runtime
 *
 * Development variant of the custom JSX runtime. Vite (and other
 * bundlers/compilers) call jsxDEV instead of jsx/jsxs in dev builds.
 *
 * Intercepts `className` exactly like the production runtime (by reusing
 * jsx/jsxs directly — no separate interception logic to keep in sync), then
 * patches `_source`/`_self` onto the result so React DevTools shows the
 * original file/line, not this wrapper.
 */

export { Fragment } from './jsx-runtime';
import { jsx, jsxs } from './jsx-runtime';
import type { ReactElement } from 'react';

export function jsxDEV(
  type: unknown,
  props: Record<string, unknown> | null,
  key?: string,
  isStaticChildren?: boolean,
  source?: { fileName: string; lineNumber: number; columnNumber: number },
  self?: unknown,
): ReactElement {
  const element = (isStaticChildren ? jsxs : jsx)(type, props, key);

  // React's dev JSX runtime freezes the returned element (and no longer
  // even defines _source/_self as of React 19), so only attempt the patch
  // when the object is still extensible — otherwise skip it rather than
  // throwing. Confirmed against the installed react/cjs/react-jsx-dev-runtime
  // .development.js, whose jsxDEV signature is (type, config, maybeKey,
  // isStaticChildren) — matching the four params this function forwards from.
  if (source && element && typeof element === 'object' && Object.isExtensible(element)) {
    (element as any)._source = source;
    (element as any)._self = self;
  }

  return element;
}
