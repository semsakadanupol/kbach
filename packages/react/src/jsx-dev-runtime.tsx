/**
 * @kbach/react/jsx-dev-runtime
 *
 * Development variant of the custom JSX runtime.
 * Babel uses jsxDEV (instead of jsx/jsxs) in dev builds.
 *
 * We intercept `className`/`kb` props exactly like the production runtime, but
 * forward `_source` to React's own jsxDEV so React DevTools can display the
 * correct file + line number for every element.
 */

export { Fragment } from './jsx-runtime';
import { jsxDEV as _jsxDEV } from 'react/jsx-dev-runtime';
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
  // Run Kbach's prop interception (className → style resolution, CSS injection).
  const element = (isStaticChildren ? jsxs : jsx)(type, props, key);

  // Patch the element's _source so React DevTools shows the original file/line,
  // not this wrapper. The _source field is non-standard but consumed by the
  // react-refresh and react-devtools-extension stacks.
  if (source && element && typeof element === 'object') {
    (element as any)._source = source;
    (element as any)._self = self;
  }

  return element;
}
