/* tslint:disable */
/* eslint-disable */

/**
 * Serializes `theme::DEFAULT_COLORS` (Phase 16) to a flat JSON object —
 * consumed at build time (not runtime; see that const's own doc comment)
 * by `scripts/generate-palette.mjs` via the Node-target build of this
 * same `#[wasm_bindgen]` export, which is what makes this usable without
 * an async init step. `BTreeMap` (alphabetical key order) rather than
 * `DEFAULT_COLORS`'s own family-grouped order — fine for a generated
 * file nobody hand-edits, and deterministic across regenerations either way.
 */
export function default_colors_json(): string;

export function generate_css(class_string: string, theme_json: string): string;

export function generate_css_attr(class_string: string, theme_json: string): string;

/**
 * WASM counterpart to the Android JNI bridge's `resolveStyle` — resolves
 * `class_string` to a flat, RN-`StyleSheet`-shaped JSON style object
 * instead of CSS rule text, for @kbach/react-native's Expo Web /
 * react-native-web fallback path (see packages/react-native/src/webBridge.ts).
 * react-native-web's `View`/`Text` accept an RN-style `style` OBJECT (which
 * react-native-web itself converts to real DOM CSS internally) — the same
 * shape the JNI bridge already produces for real native, NOT the CSS-text
 * shape `generate_css` above produces for plain DOM `@kbach/react`.
 * Delegates to the exact same `resolve_style::resolve_style_json` the JNI
 * bridge calls — zero duplicated resolution logic between the two
 * style-object FFI entry points, only the argument marshaling differs.
 */
export function resolve_style_json(class_string: string, theme_json: string, color_scheme: string, pressed: boolean, width: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly default_colors_json: () => [number, number];
    readonly generate_css: (a: number, b: number, c: number, d: number) => [number, number];
    readonly generate_css_attr: (a: number, b: number, c: number, d: number) => [number, number];
    readonly resolve_style_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
