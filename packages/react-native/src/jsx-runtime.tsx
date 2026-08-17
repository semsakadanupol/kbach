/**
 * @kbach/react-native/jsx-runtime — native (Kotlin/JNI TurboModule) entry.
 *
 * Drop-in replacement for react/jsx-runtime — same interception shape as
 * @kbach/react/jsx-runtime (Phase 3), but the resolved value becomes the
 * `style` prop instead of `className`: View/Text have no `className` prop
 * at all. Covers layout, color, spacing, border, typography, dark:,
 * active: (Pressable only), and sm:/md:/lg:/xl:/2xl: (gated against the
 * current window width, live) — see nativeBridge.ts / resolve_style.rs for
 * exactly what's resolved; every other modifier (hover:, group- and peer-
 * variants, has-[...], container queries, ...) parses but isn't applied —
 * there's no selector/pseudo-state/ancestor system on native to apply them
 * with.
 *
 * All the actual interception logic lives in jsxRuntimeCore.ts, shared
 * with jsx-runtime.web.tsx — this file's only job is wiring in
 * nativeBridge.ts's `resolveStyle`. Deliberately a SEPARATE file from the
 * web variant (not one file with a runtime Platform.OS check) because
 * @kbach/react-native ships pre-built dist/ output: for a package with an
 * explicit "exports" map (this one), Metro resolves `@kbach/react-native/
 * jsx-runtime` STRICTLY through that map's conditions — its `.web.js`
 * platform-extension file-suffix convention only applies to relative-path/
 * Haste resolution, never to package-exports resolution, so it can't swap
 * between dist/jsx-runtime.js and dist/jsx-runtime.web.js on its own no
 * matter how they're named. The actual mechanism is this package's own
 * "browser" export condition (see package.json), which Metro adds for web
 * bundles specifically — see that file's `exports["./jsx-runtime"]` entry.
 * A single file with an internal Platform.OS branch doesn't work here
 * regardless of which mechanism applies: it would still bundle
 * nativeBridge.ts's `TurboModuleRegistry` call into the web build too,
 * crashing on `TurboModuleRegistry` being undefined under react-native-web
 * (confirmed by hand: a real `expo export --platform web` + browser load
 * reproduced exactly that crash before this file was split).
 */
import { createJsxFunctions } from './jsxRuntimeCore';
import { resolveStyle } from './nativeBridge';

export { Fragment } from './jsxRuntimeCore';
export type { JSX } from './jsxRuntimeCore';

export const { jsx, jsxs } = createJsxFunctions(resolveStyle);
