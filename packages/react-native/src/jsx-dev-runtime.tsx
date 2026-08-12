/**
 * @kbach/react-native/jsx-dev-runtime
 *
 * Development variant — Metro calls jsxDEV instead of jsx/jsxs in dev
 * builds. Same pattern as @kbach/react/jsx-dev-runtime (Phase 3): reuses
 * jsx/jsxs for the actual interception, then patches _source/_self onto
 * the result so React DevTools shows the original file/line.
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
  // even defines _source/_self as of React 19) — only patch when the
  // object is still extensible. Same React-19 compatibility note as
  // @kbach/react/jsx-dev-runtime (Phase 3).
  if (source && element && typeof element === 'object' && Object.isExtensible(element)) {
    (element as any)._source = source;
    (element as any)._self = self;
  }

  return element;
}
