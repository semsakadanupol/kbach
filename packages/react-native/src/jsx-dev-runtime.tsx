/**
 * @kbach/react-native/jsx-dev-runtime — native entry. Metro calls jsxDEV
 * instead of jsx/jsxs in dev builds. See jsx-runtime.tsx's doc comment for
 * why this needs a separate .web.tsx sibling rather than one file with an
 * internal platform branch.
 */
import { createJsxDEV } from './jsxRuntimeCore';
import { jsx, jsxs } from './jsx-runtime';

export { Fragment } from './jsx-runtime';

export const jsxDEV = createJsxDEV(jsx, jsxs);
