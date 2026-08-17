/**
 * @kbach/react-native/jsx-dev-runtime — Expo Web / react-native-web entry.
 * See jsx-runtime.web.tsx's doc comment for why this needs to be a
 * separate file/build entry from the native jsx-dev-runtime.tsx.
 */
import { createJsxDEV } from './jsxRuntimeCore';
import { jsx, jsxs } from './jsx-runtime.web';

export { Fragment } from './jsx-runtime.web';

export const jsxDEV = createJsxDEV(jsx, jsxs);
