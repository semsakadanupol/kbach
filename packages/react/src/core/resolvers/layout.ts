import type { StyleValue } from '../types';
import { getEffectiveIsWeb } from '../platform';
import { FILTER_COMPOSE } from './filters';
import type { Resolver } from './types';

// ─── Standalone utility map ───────────────────────────────────────────────────
// null entries are intentionally unsupported on the current platform (silently skipped).
// Built lazily so that CSS generation mode (set by the Vite plugin before first use)
// is picked up correctly even though isWeb=false in Node.js at module load time.

let _standalone: Record<string, StyleValue | null> | null = null;

function buildStandalone(): Record<string, StyleValue | null> {
  const web = getEffectiveIsWeb();
  return {
  // Display
  // React Native only supports display:'flex'|'none'. Setting 'flex' explicitly is
  // a no-op normally, but is needed to re-show an element that was hidden via `hidden`.
  // `grid`, `contents`, `flow-root` have no native equivalent and stay null there.
  // The inline-* family (inline, inline-block, inline-flex, inline-grid) falls back
  // to 'flex' on native instead — like plain `flex`, this is a no-op most of the
  // time, but without it these utilities couldn't re-show a `hidden` element on
  // native either (null → no style applied → still display:'none').
  flex:           { display: 'flex' },
  block:          web ? { display: 'block' } : null,
  'inline-block': { display: web ? 'inline-block' : 'flex' },
  inline:         { display: web ? 'inline' : 'flex' },
  grid:           web ? { display: 'grid' } : null,
  grd:            web ? { display: 'grid' } : null,
  'inline-flex':  { display: web ? 'inline-flex' : 'flex' },
  'inline-grid':  { display: web ? 'inline-grid' : 'flex' },
  hidden:         { display: 'none' },
  contents:       web ? { display: 'contents' } : null,
  'flow-root':    web ? { display: 'flow-root' } : null,

  // Flex direction (both web and native)
  'flex-row':         { flexDirection: 'row' },
  'flex-col':         { flexDirection: 'column' },
  'flex-row-reverse': { flexDirection: 'row-reverse' },
  'flex-col-reverse': { flexDirection: 'column-reverse' },

  // Flex wrap (both)
  'flex-wrap':         { flexWrap: 'wrap' },
  'flex-wrap-reverse': { flexWrap: 'wrap-reverse' },
  'flex-nowrap':       { flexWrap: 'nowrap' },

  // Flex grow / shrink (both)
  'flex-grow':     { flexGrow: 1 },
  'flex-grow-0':   { flexGrow: 0 },
  'flex-shrink':   { flexShrink: 1 },
  'flex-shrink-0': { flexShrink: 0 },

  // Align items (both)
  'items-start':    { alignItems: 'flex-start' },
  'items-end':      { alignItems: 'flex-end' },
  'items-center':   { alignItems: 'center' },
  'items-baseline': { alignItems: 'baseline' },
  'items-stretch':  { alignItems: 'stretch' },

  // Justify content (both)
  'justify-start':   { justifyContent: 'flex-start' },
  'justify-end':     { justifyContent: 'flex-end' },
  'justify-center':  { justifyContent: 'center' },
  'justify-between': { justifyContent: 'space-between' },
  'justify-around':  { justifyContent: 'space-around' },
  'justify-evenly':  { justifyContent: 'space-evenly' },

  // Align content (both)
  'content-start':   { alignContent: 'flex-start' },
  'content-end':     { alignContent: 'flex-end' },
  'content-center':  { alignContent: 'center' },
  'content-between': { alignContent: 'space-between' },
  'content-around':  { alignContent: 'space-around' },
  'content-evenly':  { alignContent: 'space-evenly' },
  'content-stretch': { alignContent: 'stretch' },

  // Align self (both)
  'self-auto':     { alignSelf: 'auto' },
  'self-start':    { alignSelf: 'flex-start' },
  'self-end':      { alignSelf: 'flex-end' },
  'self-center':   { alignSelf: 'center' },
  'self-stretch':  { alignSelf: 'stretch' },
  'self-baseline': { alignSelf: 'baseline' },

  // Text align (both)
  'text-left':    { textAlign: 'left' },
  'text-right':   { textAlign: 'right' },
  'text-center':  { textAlign: 'center' },
  'text-justify': { textAlign: 'justify' },

  // Font weight shortcuts (both)
  'font-thin':       { fontWeight: '100' },
  'font-extralight': { fontWeight: '200' },
  'font-light':      { fontWeight: '300' },
  'font-normal':     { fontWeight: '400' },
  'font-medium':     { fontWeight: '500' },
  'font-semibold':   { fontWeight: '600' },
  'font-bold':       { fontWeight: '700' },
  'font-extrabold':  { fontWeight: '800' },
  'font-black':      { fontWeight: '900' },

  // Text decoration (overline is web-only)
  underline:     { textDecorationLine: 'underline' },
  overline:      web ? { textDecorationLine: 'overline' } : null,
  'line-through': { textDecorationLine: 'line-through' },
  'no-underline': { textDecorationLine: 'none' },

  // Text transform (both)
  uppercase:    { textTransform: 'uppercase' },
  lowercase:    { textTransform: 'lowercase' },
  capitalize:   { textTransform: 'capitalize' },
  'normal-case': { textTransform: 'none' },

  // Font style (both)
  italic:     { fontStyle: 'italic' },
  'non-italic': { fontStyle: 'normal' },

  // Position (fixed/sticky/static are web-only; RN only supports relative/absolute)
  relative: { position: 'relative' },
  absolute: { position: 'absolute' },
  fixed:    web ? { position: 'fixed' } : null,
  sticky:   web ? { position: 'sticky' } : null,
  static:   web ? { position: 'static' } : null,

  // Visibility (no `visibility` prop on native; use opacity instead)
  visible:   web ? { visibility: 'visible' } : null,
  invisible: web ? { visibility: 'hidden' } : { opacity: 0 },

  // Overflow (RN supports 'hidden' | 'visible' | 'scroll'; not 'auto')
  'overflow-hidden':  { overflow: 'hidden' },
  'overflow-visible': { overflow: 'visible' },
  'overflow-scroll':  { overflow: 'scroll' },
  'overflow-auto':    web ? { overflow: 'auto' } : { overflow: 'scroll' },
  // overflowX / overflowY are web-only
  'overflow-x-hidden': web ? { overflowX: 'hidden' } : null,
  'overflow-x-scroll': web ? { overflowX: 'scroll' } : null,
  'overflow-x-auto':   web ? { overflowX: 'auto' } : null,
  'overflow-y-hidden': web ? { overflowY: 'hidden' } : null,
  'overflow-y-scroll': web ? { overflowY: 'scroll' } : null,
  'overflow-y-auto':   web ? { overflowY: 'auto' } : null,

  // Object fit (web-only; use resizeMode prop on RN Image)
  'object-contain':    web ? { objectFit: 'contain' } : null,
  'object-cover':      web ? { objectFit: 'cover' } : null,
  'object-fill':       web ? { objectFit: 'fill' } : null,
  'object-none':       web ? { objectFit: 'none' } : null,
  'object-scale-down': web ? { objectFit: 'scale-down' } : null,

  // Border style (both)
  'border-solid':  { borderStyle: 'solid' },
  'border-dashed': { borderStyle: 'dashed' },
  'border-dotted': { borderStyle: 'dotted' },
  'border-none':   { borderWidth: 0 },

  // Border sides default width (both)
  'border-t': { borderTopWidth: 1 },
  'border-r': { borderRightWidth: 1 },
  'border-b': { borderBottomWidth: 1 },
  'border-l': { borderLeftWidth: 1 },

  // Cursor (web-only)
  'cursor-auto':        web ? { cursor: 'auto' } : null,
  'cursor-default':     web ? { cursor: 'default' } : null,
  'cursor-pointer':     web ? { cursor: 'pointer' } : null,
  'cursor-wait':        web ? { cursor: 'wait' } : null,
  'cursor-text':        web ? { cursor: 'text' } : null,
  'cursor-move':        web ? { cursor: 'move' } : null,
  'cursor-not-allowed': web ? { cursor: 'not-allowed' } : null,

  // User select (web-only)
  'select-none': web ? { userSelect: 'none' } : null,
  'select-text': web ? { userSelect: 'text' } : null,
  'select-all':  web ? { userSelect: 'all' } : null,
  'select-auto': web ? { userSelect: 'auto' } : null,

  // Pointer events (both)
  'pointer-events-none': { pointerEvents: 'none' },
  'pointer-events-auto': { pointerEvents: 'auto' },

  // Whitespace (web-only; RN Text uses numberOfLines prop instead)
  'whitespace-normal':   web ? { whiteSpace: 'normal' } : null,
  'whitespace-nowrap':   web ? { whiteSpace: 'nowrap' } : null,
  'whitespace-pre':      web ? { whiteSpace: 'pre' } : null,
  'whitespace-pre-wrap': web ? { whiteSpace: 'pre-wrap' } : null,
  'whitespace-pre-line': web ? { whiteSpace: 'pre-line' } : null,

  // Word break (web-only)
  'break-normal': web ? { overflowWrap: 'normal', wordBreak: 'normal' } : null,
  'break-words':  web ? { overflowWrap: 'break-word' } : null,
  'break-all':    web ? { wordBreak: 'break-all' } : null,

  // Misc web-only
  truncate:         web ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : null,
  'box-border':     web ? { boxSizing: 'border-box' } : null,
  'box-content':    web ? { boxSizing: 'content-box' } : null,
  'appearance-none': web ? { appearance: 'none' } : null,
  'outline-none':   web ? { outline: 'none', outlineOffset: '0' } : null,
  outline:          web ? { outline: '2px solid transparent', outlineOffset: '2px' } : null,
  resize:           web ? { resize: 'both' } : null,
  'resize-none':    web ? { resize: 'none' } : null,
  'resize-y':       web ? { resize: 'vertical' } : null,
  'resize-x':       web ? { resize: 'horizontal' } : null,
  antialiased:           web ? { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' } as StyleValue : null,
  'subpixel-antialiased': web ? { WebkitFontSmoothing: 'subpixel-antialiased', MozOsxFontSmoothing: 'auto' } as StyleValue : null,
  'overflow-ellipsis':   web ? { textOverflow: 'ellipsis' } as StyleValue : null,
  'sr-only': web ? {
    position: 'absolute', width: 1, height: 1, padding: 0,
    margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
  } : null,
  'not-sr-only': web ? {
    position: 'static', width: 'auto', height: 'auto', padding: 0,
    margin: 0, overflow: 'visible', clip: 'auto', whiteSpace: 'normal',
  } : null,

  // Lists (web-only)
  'list-none':    web ? { listStyleType: 'none' } : null,
  'list-disc':    web ? { listStyleType: 'disc' } : null,
  'list-decimal': web ? { listStyleType: 'decimal' } : null,

  // Background clip (web-only)
  'bg-clip-border':  web ? { backgroundClip: 'border-box' } : null,
  'bg-clip-padding': web ? { backgroundClip: 'padding-box' } : null,
  'bg-clip-content': web ? { backgroundClip: 'content-box' } : null,
  'bg-clip-text':    web ? { backgroundClip: 'text', WebkitBackgroundClip: 'text' } : null,

  // Background image
  'bg-none': web ? { backgroundImage: 'none' } : null,

  // Background size (web-only)
  'bg-auto':    web ? { backgroundSize: 'auto' } : null,
  'bg-cover':   web ? { backgroundSize: 'cover' } : null,
  'bg-contain': web ? { backgroundSize: 'contain' } : null,

  // Background position (web-only)
  'bg-center':       web ? { backgroundPosition: 'center' } : null,
  'bg-top':          web ? { backgroundPosition: 'top' } : null,
  'bg-bottom':       web ? { backgroundPosition: 'bottom' } : null,
  'bg-left':         web ? { backgroundPosition: 'left' } : null,
  'bg-right':        web ? { backgroundPosition: 'right' } : null,
  'bg-left-top':     web ? { backgroundPosition: 'left top' } : null,
  'bg-left-bottom':  web ? { backgroundPosition: 'left bottom' } : null,
  'bg-right-top':    web ? { backgroundPosition: 'right top' } : null,
  'bg-right-bottom': web ? { backgroundPosition: 'right bottom' } : null,

  // Background repeat (web-only)
  'bg-repeat':       web ? { backgroundRepeat: 'repeat' } : null,
  'bg-no-repeat':    web ? { backgroundRepeat: 'no-repeat' } : null,
  'bg-repeat-x':     web ? { backgroundRepeat: 'repeat-x' } : null,
  'bg-repeat-y':     web ? { backgroundRepeat: 'repeat-y' } : null,
  'bg-repeat-round': web ? { backgroundRepeat: 'round' } : null,
  'bg-repeat-space': web ? { backgroundRepeat: 'space' } : null,

  // Background attachment (web-only)
  'bg-fixed':  web ? { backgroundAttachment: 'fixed' } : null,
  'bg-local':  web ? { backgroundAttachment: 'local' } : null,
  'bg-scroll': web ? { backgroundAttachment: 'scroll' } : null,

  // Object position (web-only)
  'object-center':       web ? { objectPosition: 'center' } : null,
  'object-top':          web ? { objectPosition: 'top' } : null,
  'object-bottom':       web ? { objectPosition: 'bottom' } : null,
  'object-left':         web ? { objectPosition: 'left' } : null,
  'object-right':        web ? { objectPosition: 'right' } : null,
  'object-left-top':     web ? { objectPosition: 'left top' } : null,
  'object-left-bottom':  web ? { objectPosition: 'left bottom' } : null,
  'object-right-top':    web ? { objectPosition: 'right top' } : null,
  'object-right-bottom': web ? { objectPosition: 'right bottom' } : null,

  // Table (web-only)
  table:           web ? { display: 'table' } : null,
  'table-auto':    web ? { tableLayout: 'auto' } : null,
  'table-fixed':   web ? { tableLayout: 'fixed' } : null,
  'caption-top':   web ? { captionSide: 'top' } : null,
  'caption-bottom':web ? { captionSide: 'bottom' } : null,
  'border-collapse': web ? { borderCollapse: 'collapse' } : null,
  'border-separate': web ? { borderCollapse: 'separate' } : null,

  // List style position (web-only)
  'list-inside':  web ? { listStylePosition: 'inside' } : null,
  'list-outside': web ? { listStylePosition: 'outside' } : null,

  // Font variant numeric (web-only)
  'normal-nums':        web ? { fontVariantNumeric: 'normal' } : null,
  ordinal:              web ? { fontVariantNumeric: 'ordinal' } : null,
  'slashed-zero':       web ? { fontVariantNumeric: 'slashed-zero' } : null,
  'lining-nums':        web ? { fontVariantNumeric: 'lining-nums' } : null,
  'oldstyle-nums':      web ? { fontVariantNumeric: 'oldstyle-nums' } : null,
  'proportional-nums':  web ? { fontVariantNumeric: 'proportional-nums' } : null,
  'tabular-nums':       web ? { fontVariantNumeric: 'tabular-nums' } : null,
  'diagonal-fractions': web ? { fontVariantNumeric: 'diagonal-fractions' } : null,
  'stacked-fractions':  web ? { fontVariantNumeric: 'stacked-fractions' } : null,

  // Isolation (web-only)
  isolate:          web ? { isolation: 'isolate' } : null,
  'isolation-auto': web ? { isolation: 'auto' } : null,

  // Backface visibility (both iOS and Android)
  'backface-visible': { backfaceVisibility: 'visible' },
  'backface-hidden':  { backfaceVisibility: 'hidden' },

  // CSS filters — standalone = default/full effect (web-only)
  grayscale: web ? { '--kb-grayscale': 'grayscale(100%)', filter: FILTER_COMPOSE } : null,
  invert:    web ? { '--kb-invert': 'invert(100%)', filter: FILTER_COMPOSE } : null,
  sepia:     web ? { '--kb-sepia': 'sepia(100%)', filter: FILTER_COMPOSE } : null,

  // Divide none
  'divide-none': web ? { __divideX: 0, __divideY: 0 } as StyleValue : null,

  // Group / peer markers (no-op: no style emitted; just ensures isKnownUtility returns true)
  group: web ? {} as StyleValue : null,
  peer:  web ? {} as StyleValue : null,

  // Text-wrap (web-only)
  'text-wrap':    web ? { textWrap: 'wrap' } as StyleValue : null,
  'text-nowrap':  web ? { textWrap: 'nowrap' } as StyleValue : null,
  'text-balance': web ? { textWrap: 'balance' } as StyleValue : null,
  'text-pretty':  web ? { textWrap: 'pretty' } as StyleValue : null,

  // Screen sizing — dvw/dvh (dynamic viewport units) instead of vw/vh: on mobile
  // browsers, vh/vw are pinned to the LARGEST viewport size (address bar hidden),
  // so `h-screen` overflows behind the address bar when it's shown. dvh/dvw track
  // the actual visible viewport as browser chrome shows/hides. Desktop behavior
  // is unchanged since there's no dynamic chrome to account for.
  // (vw/dvw values are web-only; vh/dvh values work cross-platform via spacing scale for h-*)
  'w-screen':     web ? { width: '100dvw' } : null,
  'min-h-screen': { minHeight: '100dvh' },
  'max-h-screen': { maxHeight: '100dvh' },
  'min-w-screen': web ? { minWidth: '100dvw' } : null,
  'max-w-screen': web ? { maxWidth: '100dvw' } : null,

  // max-w named container sizes (mirrors Tailwind's container scale)
  'max-w-none':  { maxWidth: 'none' },
  'max-w-xs':   { maxWidth: 320 },
  'max-w-sm':   { maxWidth: 384 },
  'max-w-md':   { maxWidth: 448 },
  'max-w-lg':   { maxWidth: 512 },
  'max-w-xl':   { maxWidth: 576 },
  'max-w-2xl':  { maxWidth: 672 },
  'max-w-3xl':  { maxWidth: 768 },
  'max-w-4xl':  { maxWidth: 896 },
  'max-w-5xl':  { maxWidth: 1024 },
  'max-w-6xl':  { maxWidth: 1152 },
  'max-w-7xl':  { maxWidth: 1280 },
  'max-w-prose': web ? { maxWidth: '65ch' } : null,

  // Extended cursors (web-only)
  'cursor-grab':        web ? { cursor: 'grab' } : null,
  'cursor-grabbing':    web ? { cursor: 'grabbing' } : null,
  'cursor-zoom-in':     web ? { cursor: 'zoom-in' } : null,
  'cursor-zoom-out':    web ? { cursor: 'zoom-out' } : null,
  'cursor-crosshair':   web ? { cursor: 'crosshair' } : null,
  'cursor-help':        web ? { cursor: 'help' } : null,
  'cursor-none':        web ? { cursor: 'none' } : null,

  // Overflow clip (web-only)
  'overflow-clip':   web ? { overflow: 'clip' } : null,
  'overflow-x-clip': web ? { overflowX: 'clip' } : null,
  'overflow-y-clip': web ? { overflowY: 'clip' } : null,

  // Scroll behavior (web-only)
  'scroll-smooth': web ? { scrollBehavior: 'smooth' } as StyleValue : null,
  'scroll-auto':   web ? { scrollBehavior: 'auto' } as StyleValue : null,

  // Float (web-only)
  'float-left':  web ? { float: 'left' } as StyleValue : null,
  'float-right': web ? { float: 'right' } as StyleValue : null,
  'float-start': web ? { float: 'inline-start' } as StyleValue : null,
  'float-end':   web ? { float: 'inline-end' } as StyleValue : null,
  'float-none':  web ? { float: 'none' } as StyleValue : null,

  // Clear (web-only)
  'clear-left':  web ? { clear: 'left' } as StyleValue : null,
  'clear-right': web ? { clear: 'right' } as StyleValue : null,
  'clear-both':  web ? { clear: 'both' } as StyleValue : null,
  'clear-start': web ? { clear: 'inline-start' } as StyleValue : null,
  'clear-end':   web ? { clear: 'inline-end' } as StyleValue : null,
  'clear-none':  web ? { clear: 'none' } as StyleValue : null,

  // Vertical align (web-only)
  'align-baseline':    web ? { verticalAlign: 'baseline' } as StyleValue : null,
  'align-top':         web ? { verticalAlign: 'top' } as StyleValue : null,
  'align-middle':      web ? { verticalAlign: 'middle' } as StyleValue : null,
  'align-bottom':      web ? { verticalAlign: 'bottom' } as StyleValue : null,
  'align-text-top':    web ? { verticalAlign: 'text-top' } as StyleValue : null,
  'align-text-bottom': web ? { verticalAlign: 'text-bottom' } as StyleValue : null,
  'align-sub':         web ? { verticalAlign: 'sub' } as StyleValue : null,
  'align-super':       web ? { verticalAlign: 'super' } as StyleValue : null,

  // Touch action (web-only)
  'touch-auto':         web ? { touchAction: 'auto' } as StyleValue : null,
  'touch-none':         web ? { touchAction: 'none' } as StyleValue : null,
  'touch-pan-x':        web ? { touchAction: 'pan-x' } as StyleValue : null,
  'touch-pan-y':        web ? { touchAction: 'pan-y' } as StyleValue : null,
  'touch-pan-left':     web ? { touchAction: 'pan-left' } as StyleValue : null,
  'touch-pan-right':    web ? { touchAction: 'pan-right' } as StyleValue : null,
  'touch-pan-up':       web ? { touchAction: 'pan-up' } as StyleValue : null,
  'touch-pan-down':     web ? { touchAction: 'pan-down' } as StyleValue : null,
  'touch-pinch-zoom':   web ? { touchAction: 'pinch-zoom' } as StyleValue : null,
  'touch-manipulation': web ? { touchAction: 'manipulation' } as StyleValue : null,
  };
}

export function getStandalone(): Record<string, StyleValue | null> {
  if (!_standalone) _standalone = buildStandalone();
  return _standalone;
}

// ─── Layout-family dynamic resolvers ──────────────────────────────────────────

export const layoutResolvers: Record<string, Resolver> = {
  // ── Grid (responsive column count: grid-1 … grid-12, or arbitrary) ───────
  grid: ({ value, isArbitrary }) => {
    if (!value) return null;
    if (isArbitrary) return { display: 'grid', gridTemplateColumns: value };
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 12) return null;
    return { display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  },

  // ── Grid template columns/rows (Tailwind-style aliases, web-only) ──────────
  'grid-cols': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value) return null;
    if (isArbitrary) return { display: 'grid', gridTemplateColumns: value };
    if (value === 'none') return { display: 'grid', gridTemplateColumns: 'none' };
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 12) return null;
    return { display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  },
  'grid-rows': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value) return null;
    if (isArbitrary) return { gridTemplateRows: value };
    if (value === 'none') return { gridTemplateRows: 'none' };
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return null;
    return { gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` };
  },

  // ── Grid auto flow (web-only) ─────────────────────────────────────────────
  'grid-flow': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const flows: Record<string, string> = {
      row: 'row',
      col: 'column',
      dense: 'dense',
      'row-dense': 'row dense',
      'col-dense': 'column dense',
    };
    const flow = flows[value];
    return flow ? { gridAutoFlow: flow } : null;
  },

  // ── Grid auto sizing (web-only) ───────────────────────────────────────────
  'auto-cols': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { gridAutoColumns: value };
    const presets: Record<string, string> = {
      auto: 'auto', min: 'min-content', max: 'max-content', fr: 'minmax(0, 1fr)',
    };
    const v = presets[value];
    return v ? { gridAutoColumns: v } : null;
  },
  'auto-rows': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { gridAutoRows: value };
    const presets: Record<string, string> = {
      auto: 'auto', min: 'min-content', max: 'max-content', fr: 'minmax(0, 1fr)',
    };
    const v = presets[value];
    return v ? { gridAutoRows: v } : null;
  },

  // ── Grid column placement (web-only) ──────────────────────────────────────
  'col-span': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'full') return { gridColumn: '1 / -1' };
    const n = parseInt(value, 10);
    return isNaN(n) ? null : { gridColumn: `span ${n} / span ${n}` };
  },
  'col-start': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto') return { gridColumnStart: 'auto' };
    if (isArbitrary) return { gridColumnStart: value };
    const n = parseInt(value, 10);
    return isNaN(n) ? null : { gridColumnStart: n };
  },
  'col-end': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto') return { gridColumnEnd: 'auto' };
    if (isArbitrary) return { gridColumnEnd: value };
    const n = parseInt(value, 10);
    return isNaN(n) ? null : { gridColumnEnd: n };
  },
  col: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value || value === 'auto') return { gridColumn: 'auto' };
    if (isArbitrary) return { gridColumn: value };
    return null;
  },

  // ── Grid row placement (web-only) ─────────────────────────────────────────
  'row-span': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'full') return { gridRow: '1 / -1' };
    const n = parseInt(value, 10);
    return isNaN(n) ? null : { gridRow: `span ${n} / span ${n}` };
  },
  'row-start': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto') return { gridRowStart: 'auto' };
    if (isArbitrary) return { gridRowStart: value };
    const n = parseInt(value, 10);
    return isNaN(n) ? null : { gridRowStart: n };
  },
  'row-end': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto') return { gridRowEnd: 'auto' };
    if (isArbitrary) return { gridRowEnd: value };
    const n = parseInt(value, 10);
    return isNaN(n) ? null : { gridRowEnd: n };
  },
  row: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value || value === 'auto') return { gridRow: 'auto' };
    if (isArbitrary) return { gridRow: value };
    return null;
  },

  // ── Grid alignment (web-only) ──────────────────────────────────────────────
  // place-items is shorthand for align-items + justify-items on a grid container
  'place-items': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const map: Record<string, string> = {
      start: 'start', end: 'end', center: 'center', stretch: 'stretch', baseline: 'baseline',
    };
    return map[value] ? { placeItems: map[value] } : null;
  },
  // place-content is shorthand for align-content + justify-content on a grid container
  'place-content': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const map: Record<string, string> = {
      start: 'start', end: 'end', center: 'center', stretch: 'stretch',
      between: 'space-between', around: 'space-around', evenly: 'space-evenly', baseline: 'baseline',
    };
    return map[value] ? { placeContent: map[value] } : null;
  },
  // justify-items controls inline-axis alignment of grid items within their cells
  'justify-items': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const map: Record<string, string> = {
      start: 'start', end: 'end', center: 'center', stretch: 'stretch',
    };
    return map[value] ? { justifyItems: map[value] } : null;
  },
  // place-self is shorthand for align-self + justify-self on a grid item
  'place-self': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const map: Record<string, string> = {
      auto: 'auto', start: 'start', end: 'end', center: 'center', stretch: 'stretch',
    };
    return map[value] ? { placeSelf: map[value] } : null;
  },
  // justify-self controls inline-axis self-alignment of a grid item
  'justify-self': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const map: Record<string, string> = {
      auto: 'auto', start: 'start', end: 'end', center: 'center', stretch: 'stretch',
    };
    return map[value] ? { justifySelf: map[value] } : null;
  },

  // ── Flex ───────────────────────────────────────────────────────────────────
  flex: ({ value, isArbitrary }, { flex }) => {
    if (!value) return { display: 'flex' };
    if (isArbitrary) {
      const v = parseFloat(value);
      return isNaN(v) ? null : { flex: v };
    }
    if (value in flex) {
      const v = flex[value];
      if (typeof v === 'string' && !getEffectiveIsWeb()) {
        // React Native doesn't support string flex values — map to numeric equivalents
        if (v === 'auto' || v === 'initial') return { flex: 1 };
        if (v === 'none') return { flex: 0 };
        return null;
      }
      return { flex: v };
    }
    const n = parseFloat(value);
    return isNaN(n) ? null : { flex: n };
  },
  grow: ({ value }, _) => {
    if (!value) return { flexGrow: 1 };
    const n = parseFloat(value);
    return { flexGrow: isNaN(n) ? 1 : n };
  },
  shrink: ({ value }, _) => {
    if (!value) return { flexShrink: 1 };
    const n = parseFloat(value);
    return { flexShrink: isNaN(n) ? 1 : n };
  },
  order: ({ value, negative }, _) => {
    const n = parseInt(value, 10);
    return isNaN(n) ? null : { order: negative ? -n : n };
  },

  // ── Z-index ────────────────────────────────────────────────────────────────
  z: ({ value, isArbitrary }, { zIndex }) => {
    if (isArbitrary) {
      const n = parseInt(value);
      return isNaN(n) ? null : { zIndex: n };
    }
    const v = zIndex[value];
    if (v !== undefined) {
      // 'auto' is a valid CSS keyword but React Native requires a number
      if (v === 'auto') return getEffectiveIsWeb() ? { zIndex: 'auto' } : null;
      return { zIndex: v };
    }
    const n = parseInt(value);
    return isNaN(n) ? null : { zIndex: n };
  },

  // ── Aspect ratio ───────────────────────────────────────────────────────────
  aspect: ({ value, isArbitrary }) => {
    if (isArbitrary) return { aspectRatio: value };
    const presets: Record<string, string | number> = { auto: 'auto', square: 1, video: 16 / 9 };
    if (!(value in presets)) return null;
    const v = presets[value];
    // 'auto' is a CSS keyword — web only; React Native requires a number
    if (v === 'auto') return getEffectiveIsWeb() ? { aspectRatio: 'auto' } : null;
    return { aspectRatio: v };
  },

  // ── Columns (web-only) ─────────────────────────────────────────────────────
  columns: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { columnCount: value };
    if (value === 'auto') return { columnCount: 'auto' };
    const n = parseInt(value, 10);
    if (!isNaN(n)) return { columnCount: n };
    const widths: Record<string, string> = {
      '3xs': '16rem', '2xs': '18rem', xs: '20rem', sm: '24rem', md: '28rem',
      lg: '32rem', xl: '36rem', '2xl': '42rem', '3xl': '48rem',
      '4xl': '56rem', '5xl': '64rem', '6xl': '72rem', '7xl': '80rem',
    };
    return widths[value] ? { columnWidth: widths[value] } : null;
  },
};
