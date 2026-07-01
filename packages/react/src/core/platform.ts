/**
 * Detected at module load time — safe to call repeatedly without perf cost.
 */
export const isWeb: boolean =
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.document.createElement !== 'undefined';

// True only in React Native — NOT in Node.js SSR. SSR runs in Node where window/document
// are absent (same as RN) but the output is web HTML, so className and CSS shorthands
// must behave like the browser. We detect RN by its unique globals (Hermes, Bridge, etc.).
export const isNative: boolean =
  !isWeb && (
    typeof (globalThis as any).HermesInternal !== 'undefined' ||
    typeof (globalThis as any).__fbBatchedBridge !== 'undefined' ||
    (typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative') ||
    typeof (globalThis as any).__REACT_NATIVE__ !== 'undefined'
  );

// CSS generation mode: set to true by the Vite plugin (which runs in Node.js)
// so that web-only resolver branches generate CSS rather than returning null.
let _cssGenMode = false;
export function setCSSGenMode(on: boolean): void { _cssGenMode = on; }
// Returns true in browser, Vite plugin, and SSR (Node.js for web) — false in React Native.
export function getEffectiveIsWeb(): boolean { return isWeb || _cssGenMode || !isNative; }

/**
 * Convert an arbitrary-bracket value to a native-friendly number when possible.
 * e.g. '10px' → 10,  '1rem' → 16,  '50%' → '50%' (keep as string),  '#fff' → '#fff'
 */
export function toNativeValue(raw: string): string | number {
  if (/^-?\d+(\.\d+)?px$/.test(raw)) return parseFloat(raw);
  if (/^-?\d+(\.\d+)?rem$/.test(raw)) return parseFloat(raw) * 16;
  // em values are converted at a fixed 16px base; this is approximate for non-16px font contexts
  if (/^-?\d+(\.\d+)?em$/.test(raw)) return parseFloat(raw) * 16;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);
  return raw; // percentages, vh, vw, colors, etc. — pass through
}

/**
 * Escape a class name for use inside a CSS selector.
 * e.g. 'bg-[#fff]'  →  'bg-\\[\\#fff\\]'
 */
export function escapeCSSSelector(cls: string): string {
  return cls.replace(/[ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
}
