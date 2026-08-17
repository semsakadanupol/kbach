/**
 * @kbach/react-native/jsx-runtime — Expo Web / react-native-web entry.
 *
 * Metro auto-selects THIS file (dist/jsx-runtime.web.js) over the native
 * one (dist/jsx-runtime.js) via this package's "browser" export condition
 * (package.json's `exports["./jsx-runtime"].browser`), which Metro adds
 * to its active condition set specifically for web bundles — see
 * jsx-runtime.tsx's doc comment for why the `.web.js` filename-suffix
 * convention alone does NOT do this for a package with an explicit
 * "exports" map, and for the full reasoning on why this needs to be a
 * genuinely separate file (and separate tsup build entry) rather than one
 * file with an internal Platform.OS branch.
 *
 * Uses jsxRuntimeCoreWeb.ts, NOT the native entry's jsxRuntimeCore.ts —
 * genuinely different interception behavior on web (real CSS + `dataSet`,
 * not a resolved `style` object), not just a different resolve function —
 * see jsxRuntimeCoreWeb.ts's own doc comment. nativeBridge.web.ts
 * initializes the WASM module eagerly at its own module load time, so
 * there's no async readiness gate here to worry about — resolveClassName()
 * is safe to call the moment this module loads.
 */
import { createJsxFunctionsWeb } from './jsxRuntimeCoreWeb';
import { resolveClassName } from './nativeBridge.web';

export { Fragment } from './jsxRuntimeCoreWeb';
export type { JSX } from './jsxRuntimeCoreWeb';

export const { jsx, jsxs } = createJsxFunctionsWeb(resolveClassName);
