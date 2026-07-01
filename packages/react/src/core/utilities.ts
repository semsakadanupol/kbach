import type { ParsedClass, StyleValue, ThemeConfig, ThemeColors } from './types';
import { isWeb, getEffectiveIsWeb, toNativeValue } from './platform';

// ─── Color resolution ─────────────────────────────────────────────────────────

export function resolveColor(value: string, colors: ThemeColors, isArbitrary: boolean): string | null {
  if (isArbitrary) return value;

  // Slash opacity: 'blue-500/50', 'black/80', 'white/[0.3]'
  const slashIdx = value.indexOf('/');
  const colorPart = slashIdx > 0 ? value.slice(0, slashIdx) : value;
  const opacityPart = slashIdx > 0 ? value.slice(slashIdx + 1) : null;

  // Resolve base hex
  let hex: string | null = null;
  if (colorPart in colors) {
    const entry = colors[colorPart];
    if (typeof entry === 'string') hex = entry;
    else if (typeof entry === 'object' && '6' in entry) hex = entry['6']!;
  } else {
    const lastDash = colorPart.lastIndexOf('-');
    if (lastDash > 0) {
      const colorName = colorPart.slice(0, lastDash);
      const shade = colorPart.slice(lastDash + 1);
      const scale = colors[colorName];
      if (scale && typeof scale === 'object' && shade in scale) {
        hex = (scale as Record<string, string>)[shade] ?? null;
      }
    }
  }

  // Dereference palette aliases: e.g. "orange-6" → "#f47c0c"
  // Users can set a color to a built-in reference in their config.
  if (hex && !hex.startsWith('#') && !hex.startsWith('rgb') &&
      hex !== 'transparent' && hex !== 'currentColor') {
    if (hex in colors) {
      const alias = colors[hex];
      if (typeof alias === 'string') hex = alias;
      else if (typeof alias === 'object' && '6' in alias) hex = (alias as Record<string, string>)['6'] ?? hex;
    } else {
      const aliasLastDash = hex.lastIndexOf('-');
      if (aliasLastDash > 0) {
        const aliasColorName = hex.slice(0, aliasLastDash);
        const aliasShade = hex.slice(aliasLastDash + 1);
        const aliasScale = colors[aliasColorName];
        if (aliasScale && typeof aliasScale === 'object') {
          hex = (aliasScale as Record<string, string>)[aliasShade] ?? null;
        } else if (typeof aliasScale === 'string') {
          hex = aliasScale;
        }
      }
    }
  }

  if (!hex) return null;
  if (!opacityPart) {
    // React Native doesn't support 8-char hex (#RRGGBBAA) — convert to rgba() to preserve embedded alpha.
    if (!getEffectiveIsWeb() && hex.startsWith('#') && hex.length === 9) {
      return hexToRgba(hex, Math.round(parseInt(hex.slice(7, 9), 16) / 255 * 1000) / 1000);
    }
    return hex;
  }

  // Parse opacity: '50' → 0.5, '[0.3]' → 0.3
  let alpha: number;
  if (opacityPart.startsWith('[') && opacityPart.endsWith(']')) {
    const v = parseFloat(opacityPart.slice(1, -1));
    alpha = v > 1 ? v / 100 : v;
  } else {
    alpha = parseFloat(opacityPart) / 100;
  }
  if (isNaN(alpha)) return hex;

  return hexToRgba(hex, alpha);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseInt(h[0]! + h[0]!, 16);
    g = parseInt(h[1]! + h[1]!, 16);
    b = parseInt(h[2]! + h[2]!, 16);
  } else {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Spacing resolution ───────────────────────────────────────────────────────

export function resolveSpacing(
  value: string,
  negative: boolean,
  spacing: ThemeConfig['spacing'],
  isArbitrary: boolean,
): string | number | null {
  if (isArbitrary) {
    const resolved = getEffectiveIsWeb() ? value : toNativeValue(value);
    if (negative) {
      if (typeof resolved === 'number') return -resolved;
      if (typeof resolved === 'string') {
        if (/^\d/.test(resolved)) return `-${resolved}`;
        if (/^(calc|var|min|max|clamp|env)\s*\(/.test(resolved)) return `calc(-1 * (${resolved}))`;
      }
    }
    return resolved;
  }

  const raw = spacing[value];
  if (raw === undefined) return null;

  if (typeof raw === 'number') return negative ? -raw : raw;
  if (raw === 'auto') return 'auto';
  if (negative && typeof raw === 'string' && raw.endsWith('%')) {
    return `-${raw}`;
  }
  return raw;
}

// ─── Sizing resolution (w, h, min-*, max-*) ──────────────────────────────────

export function resolveSizing(
  value: string,
  spacing: ThemeConfig['spacing'],
  isArbitrary: boolean,
): string | number | null {
  if (isArbitrary) return getEffectiveIsWeb() ? value : toNativeValue(value);

  const raw = spacing[value];
  if (raw !== undefined) return raw;

  // Fractions as percentages: '1/2' → '50%'
  if (/^\d+\/\d+$/.test(value)) {
    const [num, den] = value.split('/').map(Number);
    if (!den) return null; // #3: guard division-by-zero
    return `${((num / den) * 100).toFixed(6)}%`;
  }

  return null;
}

// ─── Radius resolution ───────────────────────────────────────────────────────

function resolveRadius(
  value: string,
  radii: ThemeConfig['borderRadius'],
  isArbitrary: boolean,
): string | number | null {
  if (isArbitrary) return getEffectiveIsWeb() ? value : toNativeValue(value);
  const key = value === '' ? 'DEFAULT' : value;
  return radii[key] ?? null;
}

// ─── Font size resolution ─────────────────────────────────────────────────────

function resolveFontSize(
  value: string,
  fontSizes: ThemeConfig['fontSize'],
  isArbitrary: boolean,
): number | string | null {
  if (isArbitrary) return getEffectiveIsWeb() ? value : toNativeValue(value);
  return fontSizes[value] ?? null;
}

// ─── CSS variable compose strings for stackable filter utilities ──────────────
// Each filter/backdrop utility sets its own CSS variable AND emits the same combined
// `filter` string. Multiple utilities on the same element each set a different var,
// and the shared expression reads them all — composable without JS post-processing.

const FILTER_COMPOSE =
  'var(--tw-blur,) var(--tw-brightness,) var(--tw-contrast,) var(--tw-grayscale,) var(--tw-hue-rotate,) var(--tw-invert,) var(--tw-saturate,) var(--tw-sepia,) var(--tw-drop-shadow,)';

const BACKDROP_FILTER_COMPOSE =
  'var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,)';

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
  // `grid`, `inline-*`, `contents`, `flow-root` have no native equivalent.
  flex:           { display: 'flex' },
  block:          web ? { display: 'block' } : null,
  'inline-block': web ? { display: 'inline-block' } : null,
  inline:         web ? { display: 'inline' } : null,
  grid:           web ? { display: 'grid' } : null,
  grd:            web ? { display: 'grid' } : null,
  'inline-flex':  { display: web ? 'inline-flex' : 'flex' },
  'inline-grid':  web ? { display: 'inline-grid' } : null,
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
  grayscale: web ? { '--tw-grayscale': 'grayscale(100%)', filter: FILTER_COMPOSE } : null,
  invert:    web ? { '--tw-invert': 'invert(100%)', filter: FILTER_COMPOSE } : null,
  sepia:     web ? { '--tw-sepia': 'sepia(100%)', filter: FILTER_COMPOSE } : null,

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

  // Screen sizing (vw values are web-only; vh values work cross-platform via spacing scale for h-*)
  'w-screen':     web ? { width: '100vw' } : null,
  'min-h-screen': { minHeight: '100vh' },
  'max-h-screen': { maxHeight: '100vh' },
  'min-w-screen': web ? { minWidth: '100vw' } : null,
  'max-w-screen': web ? { maxWidth: '100vw' } : null,

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

function getStandalone(): Record<string, StyleValue | null> {
  if (!_standalone) _standalone = buildStandalone();
  return _standalone;
}

// ─── Dynamic utility resolvers ────────────────────────────────────────────────

type Resolver = (parsed: ParsedClass, theme: ThemeConfig) => StyleValue | null;

const RESOLVERS: Record<string, Resolver> = {
  // ── Background ─────────────────────────────────────────────────────────────
  bg: ({ value, isArbitrary }, { colors }) => {
    const color = resolveColor(value, colors, isArbitrary);
    return color ? { backgroundColor: color } : null;
  },
  'bg-opacity': ({ value, isArbitrary }, _) => {
    if (!getEffectiveIsWeb()) return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    const v = isArbitrary ? (n > 1 ? n / 100 : n) : n / 100;
    return { '--bg-opacity': v } as StyleValue;
  },

  // ── Text ───────────────────────────────────────────────────────────────────
  text: ({ value, isArbitrary }, { colors, fontSize }) => {
    // Priority: font size named tokens first, then color
    const size = resolveFontSize(value, fontSize, false);
    if (!isArbitrary && size !== null) return { fontSize: size };

    // Arbitrary: detect by content
    if (isArbitrary) {
      if (/^\d/.test(value) || /^(calc|min|max|clamp)/.test(value)) {
        return { fontSize: getEffectiveIsWeb() ? value : toNativeValue(value) };
      }
      return { color: value };
    }

    const color = resolveColor(value, colors, false);
    return color ? { color } : null;
  },
  'text-opacity': ({ value, isArbitrary }, _) => {
    if (!getEffectiveIsWeb()) return null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    const v = isArbitrary ? (n > 1 ? n / 100 : n) : n / 100;
    return { '--text-opacity': v } as StyleValue;
  },

  // ── Padding ────────────────────────────────────────────────────────────────
  p: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { padding: v } : null;
  },
  px: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { paddingHorizontal: v } : null;
  },
  py: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { paddingVertical: v } : null;
  },
  pt: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { paddingTop: v } : null;
  },
  pr: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { paddingRight: v } : null;
  },
  pb: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { paddingBottom: v } : null;
  },
  pl: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { paddingLeft: v } : null;
  },

  // ── Margin ─────────────────────────────────────────────────────────────────
  m: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { margin: v } : null;
  },
  mx: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { marginHorizontal: v } : null;
  },
  my: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { marginVertical: v } : null;
  },
  mt: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { marginTop: v } : null;
  },
  mr: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { marginRight: v } : null;
  },
  mb: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { marginBottom: v } : null;
  },
  ml: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { marginLeft: v } : null;
  },

  // ── Sizing ─────────────────────────────────────────────────────────────────
  w: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { width: v } : null;
  },
  h: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { height: v } : null;
  },
  'min-w': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { minWidth: v } : null;
  },
  'min-h': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { minHeight: v } : null;
  },
  'max-w': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { maxWidth: v } : null;
  },
  'max-h': ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { maxHeight: v } : null;
  },

  // ── Border width ───────────────────────────────────────────────────────────
  border: ({ value, isArbitrary }, { colors, borderWidth, spacing }) => {
    if (!value) return { borderWidth: borderWidth['DEFAULT'] ?? 1 };

    if (isArbitrary) {
      // toNativeValue returns a number for px/rem/bare-numeric values; strings for colors.
      const w = toNativeValue(value);
      if (typeof w === 'number') return { borderWidth: w };
      return { borderColor: value };
    }

    const color = resolveColor(value, colors, false);
    if (color) return { borderColor: color };

    const w = borderWidth[value] ?? spacing[value];
    if (w !== undefined) {
      const numW = typeof w === 'number' ? w : parseFloat(String(w));
      if (isNaN(numW)) return null;
      return { borderWidth: numW };
    }
    return null;
  },

  'border-t': ({ value, isArbitrary }, { colors, borderWidth }) => {
    if (!value) return { borderTopWidth: 1 };
    if (isArbitrary) {
      const w = toNativeValue(value);
      if (typeof w === 'number') return { borderTopWidth: w };
      return { borderTopColor: value };
    }
    const color = resolveColor(value, colors, false);
    if (color) return { borderTopColor: color };
    const w = borderWidth[value];
    return w !== undefined ? { borderTopWidth: w } : null;
  },
  'border-r': ({ value, isArbitrary }, { colors, borderWidth }) => {
    if (!value) return { borderRightWidth: 1 };
    if (isArbitrary) {
      const w = toNativeValue(value);
      if (typeof w === 'number') return { borderRightWidth: w };
      return { borderRightColor: value };
    }
    const color = resolveColor(value, colors, false);
    if (color) return { borderRightColor: color };
    const w = borderWidth[value];
    return w !== undefined ? { borderRightWidth: w } : null;
  },
  'border-b': ({ value, isArbitrary }, { colors, borderWidth }) => {
    if (!value) return { borderBottomWidth: 1 };
    if (isArbitrary) {
      const w = toNativeValue(value);
      if (typeof w === 'number') return { borderBottomWidth: w };
      return { borderBottomColor: value };
    }
    const color = resolveColor(value, colors, false);
    if (color) return { borderBottomColor: color };
    const w = borderWidth[value];
    return w !== undefined ? { borderBottomWidth: w } : null;
  },
  'border-l': ({ value, isArbitrary }, { colors, borderWidth }) => {
    if (!value) return { borderLeftWidth: 1 };
    if (isArbitrary) {
      const w = toNativeValue(value);
      if (typeof w === 'number') return { borderLeftWidth: w };
      return { borderLeftColor: value };
    }
    const color = resolveColor(value, colors, false);
    if (color) return { borderLeftColor: color };
    const w = borderWidth[value];
    return w !== undefined ? { borderLeftWidth: w } : null;
  },

  // ── Border radius ──────────────────────────────────────────────────────────
  rounded: ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderRadius: r } : null;
  },
  'rounded-t': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopLeftRadius: r, borderTopRightRadius: r } : null;
  },
  'rounded-r': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopRightRadius: r, borderBottomRightRadius: r } : null;
  },
  'rounded-b': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderBottomLeftRadius: r, borderBottomRightRadius: r } : null;
  },
  'rounded-l': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopLeftRadius: r, borderBottomLeftRadius: r } : null;
  },
  'rounded-tl': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopLeftRadius: r } : null;
  },
  'rounded-tr': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderTopRightRadius: r } : null;
  },
  'rounded-bl': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderBottomLeftRadius: r } : null;
  },
  'rounded-br': ({ value, isArbitrary }, { borderRadius }) => {
    const r = resolveRadius(value, borderRadius, isArbitrary);
    return r !== null ? { borderBottomRightRadius: r } : null;
  },

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

  // ── CSS Filters (composable via CSS variables, web-only) ─────────────────
  blur: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const sizes: Record<string, string> = {
      '': 'blur(8px)', sm: 'blur(4px)', md: 'blur(12px)',
      lg: 'blur(16px)', xl: 'blur(24px)', '2xl': 'blur(40px)', '3xl': 'blur(64px)',
    };
    if (value === 'none') return { '--tw-blur': '', filter: FILTER_COMPOSE } as StyleValue;
    const v = isArbitrary ? `blur(${value})` : sizes[value];
    return v !== undefined ? { '--tw-blur': v, filter: FILTER_COMPOSE } as StyleValue : null;
  },
  brightness: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `brightness(${value})` : `brightness(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--tw-brightness': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  contrast: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `contrast(${value})` : `contrast(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--tw-contrast': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  grayscale: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = value === '0' ? 'grayscale(0)' : 'grayscale(100%)';
    return { '--tw-grayscale': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  'hue-rotate': ({ value, negative, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (isNaN(parseFloat(deg)) && !isArbitrary) return null;
    return { '--tw-hue-rotate': `hue-rotate(${deg})`, filter: FILTER_COMPOSE } as StyleValue;
  },
  invert: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = value === '0' ? 'invert(0)' : 'invert(100%)';
    return { '--tw-invert': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  saturate: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `saturate(${value})` : `saturate(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--tw-saturate': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  sepia: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = value === '0' ? 'sepia(0)' : 'sepia(100%)';
    return { '--tw-sepia': v, filter: FILTER_COMPOSE } as StyleValue;
  },
  'drop-shadow': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { '--tw-drop-shadow': `drop-shadow(${value.replace(/_/g, ' ')})`, filter: FILTER_COMPOSE } as StyleValue;
    const presets: Record<string, string> = {
      '': 'drop-shadow(0 1px 2px rgb(0 0 0/0.1)) drop-shadow(0 1px 1px rgb(0 0 0/0.06))',
      sm: 'drop-shadow(0 1px 1px rgb(0 0 0/0.05))',
      md: 'drop-shadow(0 4px 3px rgb(0 0 0/0.07)) drop-shadow(0 2px 2px rgb(0 0 0/0.06))',
      lg: 'drop-shadow(0 10px 8px rgb(0 0 0/0.04)) drop-shadow(0 4px 3px rgb(0 0 0/0.1))',
      xl: 'drop-shadow(0 20px 13px rgb(0 0 0/0.03)) drop-shadow(0 8px 5px rgb(0 0 0/0.08))',
      '2xl': 'drop-shadow(0 25px 25px rgb(0 0 0/0.15))',
      none: 'drop-shadow(0 0 #0000)',
    };
    const v = presets[value];
    return v !== undefined ? { '--tw-drop-shadow': v, filter: FILTER_COMPOSE } as StyleValue : null;
  },
  // Arbitrary full filter string: filter-[blur(4px)_grayscale(1)]
  filter: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { filter: value.replace(/_/g, ' ') };
    if (value === 'none') return { filter: 'none' };
    return null;
  },

  // ── Backdrop Filters (composable via CSS variables, web-only) ────────────
  'backdrop-blur': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const sizes: Record<string, string> = {
      '': 'blur(8px)', sm: 'blur(4px)', md: 'blur(12px)',
      lg: 'blur(16px)', xl: 'blur(24px)', '2xl': 'blur(40px)', '3xl': 'blur(64px)',
    };
    if (value === 'none') return { '--tw-backdrop-blur': '', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
    const v = isArbitrary ? `blur(${value})` : sizes[value];
    return v !== undefined ? { '--tw-backdrop-blur': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue : null;
  },
  'backdrop-brightness': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `brightness(${value})` : `brightness(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--tw-backdrop-brightness': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-contrast': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `contrast(${value})` : `contrast(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--tw-backdrop-contrast': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-grayscale': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    return { '--tw-backdrop-grayscale': value === '0' ? 'grayscale(0)' : 'grayscale(100%)', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-hue-rotate': ({ value, negative, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (isNaN(parseFloat(deg)) && !isArbitrary) return null;
    return { '--tw-backdrop-hue-rotate': `hue-rotate(${deg})`, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-invert': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    return { '--tw-backdrop-invert': value === '0' ? 'invert(0)' : 'invert(100%)', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-opacity': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `opacity(${value})` : `opacity(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--tw-backdrop-opacity': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-saturate': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    const v = isArbitrary ? `saturate(${value})` : `saturate(${parseFloat(value) / 100})`;
    return isNaN(parseFloat(value)) && !isArbitrary ? null : { '--tw-backdrop-saturate': v, backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-sepia': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    return { '--tw-backdrop-sepia': value === '0' ? 'sepia(0)' : 'sepia(100%)', backdropFilter: BACKDROP_FILTER_COMPOSE } as StyleValue;
  },
  'backdrop-filter': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { backdropFilter: value.replace(/_/g, ' ') };
    if (value === 'none') return { backdropFilter: 'none' };
    return null;
  },

  // ── Background gradient (CSS variable gradient stops, web-only) ──────────
  'bg-gradient-to': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const directions: Record<string, string> = {
      t: 'to top', tr: 'to top right', r: 'to right', br: 'to bottom right',
      b: 'to bottom', bl: 'to bottom left', l: 'to left', tl: 'to top left',
    };
    const dir = directions[value];
    if (!dir) return null;
    return {
      backgroundImage: `linear-gradient(${dir}, var(--tw-gradient-from, transparent), var(--tw-gradient-stops, transparent))`,
    } as StyleValue;
  },
  from: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    if (!color) return null;
    return {
      '--tw-gradient-from': color,
      '--tw-gradient-stops': `var(--tw-gradient-from), var(--tw-gradient-to, transparent)`,
    } as StyleValue;
  },
  via: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    if (!color) return null;
    return {
      '--tw-gradient-via': color,
      '--tw-gradient-stops': `var(--tw-gradient-from), var(--tw-gradient-via), var(--tw-gradient-to, transparent)`,
    } as StyleValue;
  },
  to: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    if (!color) return null;
    return { '--tw-gradient-to': color } as StyleValue;
  },

  // ── Transform extras (web-only) ───────────────────────────────────────────
  'skew-x': ({ value, negative, isArbitrary }) => {
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    return getEffectiveIsWeb()
      ? { transform: `skewX(${deg})` }
      : { transform: [{ skewX: deg }] };
  },
  'skew-y': ({ value, negative, isArbitrary }) => {
    const deg = isArbitrary ? value : `${(negative ? -1 : 1) * parseFloat(value)}deg`;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    return getEffectiveIsWeb()
      ? { transform: `skewY(${deg})` }
      : { transform: [{ skewY: deg }] };
  },
  // Arbitrary full transform string: transform-[rotate(45deg)_scale(1.5)]
  transform: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { transform: value.replace(/_/g, ' ') };
    if (value === 'none') return { transform: 'none' };
    return null;
  },
  // Transform origin
  origin: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { transformOrigin: value.replace(/_/g, ' ') };
    const origins: Record<string, string> = {
      center: 'center', top: 'top', 'top-right': 'top right',
      right: 'right', 'bottom-right': 'bottom right',
      bottom: 'bottom', 'bottom-left': 'bottom left',
      left: 'left', 'top-left': 'top left',
    };
    return origins[value] ? { transformOrigin: origins[value] } : null;
  },

  // ── Text decoration advanced (web-only) ───────────────────────────────────
  decoration: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) {
      if (/^\d/.test(value) || value.startsWith('calc(')) return { textDecorationThickness: value };
      return { textDecorationColor: value };
    }
    const thickTokens: Record<string, string> = {
      auto: 'auto', 'from-font': 'from-font',
      '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px',
    };
    if (value in thickTokens) return { textDecorationThickness: thickTokens[value] };
    const styleTokens: Record<string, string> = {
      solid: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double', wavy: 'wavy',
    };
    if (value in styleTokens) return { textDecorationStyle: styleTokens[value] };
    const color = resolveColor(value, colors, false);
    return color ? { textDecorationColor: color } : null;
  },
  'underline-offset': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { textUnderlineOffset: value };
    const offsets: Record<string, string> = {
      auto: 'auto', '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px',
    };
    return offsets[value] ? { textUnderlineOffset: offsets[value] } : null;
  },

  // ── Outline extended (web-only) ───────────────────────────────────────────
  outline: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!value) return { outline: '2px solid transparent', outlineOffset: '2px' };
    if (value === 'none') return { outline: 'none', outlineOffset: '0' };
    if (isArbitrary) {
      if (/^\d/.test(value) || value.startsWith('calc(')) return { outlineWidth: value };
      return { outlineColor: value };
    }
    const widths: Record<string, string> = { '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px' };
    if (value in widths) return { outlineWidth: widths[value] };
    const color = resolveColor(value, colors, false);
    return color ? { outlineColor: color } : null;
  },
  'outline-offset': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { outlineOffset: value };
    const offsets: Record<string, string> = { '0': '0px', '1': '1px', '2': '2px', '4': '4px', '8': '8px' };
    return offsets[value] ? { outlineOffset: offsets[value] } : null;
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

  // ── Mix / background blend mode (web-only) ───────────────────────────────
  'mix-blend': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const modes = [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
      'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
      'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter',
    ];
    return modes.includes(value) ? { mixBlendMode: value } : null;
  },
  'bg-blend': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const modes = [
      'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
      'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference',
      'exclusion', 'hue', 'saturation', 'color', 'luminosity',
    ];
    return modes.includes(value) ? { backgroundBlendMode: value } as StyleValue : null;
  },

  // ── Will-change (web-only) ─────────────────────────────────────────────────
  'will-change': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { willChange: value.replace(/_/g, ', ') };
    const presets: Record<string, string> = {
      auto: 'auto', scroll: 'scroll-position', contents: 'contents', transform: 'transform',
    };
    return presets[value] ? { willChange: presets[value] } : null;
  },

  // ── Divide (child combinator CSS, web-only) ───────────────────────────────
  // These return special __divide* markers that resolver.ts converts to
  // .cls > * + * { border-... } CSS rules. No inline style is applied.
  'divide-x': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'reverse') return null;
    if (!value) return { __divideX: 1 } as StyleValue;
    const n = parseFloat(value);
    return isNaN(n) ? null : { __divideX: n } as StyleValue;
  },
  'divide-y': ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'reverse') return null;
    if (!value) return { __divideY: 1 } as StyleValue;
    const n = parseFloat(value);
    return isNaN(n) ? null : { __divideY: n } as StyleValue;
  },
  divide: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { __divideColor: value } as StyleValue;
    // Style keywords
    const styleTokens: Record<string, string> = {
      solid: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double', none: 'none',
    };
    if (value in styleTokens) return { __divideStyle: styleTokens[value] } as StyleValue;
    // Color
    const color = resolveColor(value, colors, false);
    return color ? { __divideColor: color } as StyleValue : null;
  },

  // ── Text shadow (cross-platform: iOS, Android, web) ─────────────────────
  // Named presets give cross-platform shadow; arbitrary is web-only.
  'text-shadow': ({ value, isArbitrary }, { colors }) => {
    if (value === 'none') {
      return getEffectiveIsWeb()
        ? { textShadow: 'none' }
        : { textShadowColor: 'transparent', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0 } as StyleValue;
    }
    type NativePreset = { textShadowColor: string; textShadowOffset: { width: number; height: number }; textShadowRadius: number };
    const webPresets: Record<string, string> = {
      '':   '0 2px 4px rgba(0,0,0,0.3)',
      sm:   '0 1px 2px rgba(0,0,0,0.3)',
      md:   '0 4px 6px rgba(0,0,0,0.3)',
      lg:   '0 8px 16px rgba(0,0,0,0.5)',
      xl:   '0 16px 32px rgba(0,0,0,0.5)',
    };
    const nativePresets: Record<string, NativePreset> = {
      '':   { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 },  textShadowRadius: 4  },
      sm:   { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 },  textShadowRadius: 2  },
      md:   { textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 4 },  textShadowRadius: 6  },
      lg:   { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 8 },  textShadowRadius: 16 },
      xl:   { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 16 }, textShadowRadius: 32 },
    };
    if (value in webPresets) {
      if (getEffectiveIsWeb()) return { textShadow: webPresets[value] };
      return (nativePresets[value] ?? null) as StyleValue | null;
    }
    if (isArbitrary) {
      return getEffectiveIsWeb() ? { textShadow: value.replace(/_/g, ' ') } : null;
    }
    // Color token: set shadow color only (keeps last preset's offset/radius on native)
    const color = resolveColor(value, colors, false);
    if (color) {
      return getEffectiveIsWeb()
        ? { textShadow: `0 2px 4px ${color}` }
        : { textShadowColor: color } as StyleValue;
    }
    return null;
  },

  // ── Perspective transform (cross-platform: iOS, Android, web) ────────────
  perspective: ({ value, isArbitrary }) => {
    if (isArbitrary) {
      const numPx = parseFloat(value);
      if (getEffectiveIsWeb()) return { transform: `perspective(${value})` };
      return isNaN(numPx) ? null : { transform: [{ perspective: numPx }] };
    }
    if (value === 'none') return getEffectiveIsWeb() ? { transform: 'none' } : null;
    const n = parseFloat(value);
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `perspective(${n}px)` }
      : { transform: [{ perspective: n }] };
  },

  // ── Tint color (native-only, for Image and icon components) ──────────────
  tint: ({ value, isArbitrary }, { colors }) => {
    if (getEffectiveIsWeb()) return null;
    const color = resolveColor(value, colors, isArbitrary);
    return color ? { tintColor: color } as StyleValue : null;
  },

  // ── Size shorthand (sets width AND height in one utility) ────────────────
  size: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { width: v, height: v } : null;
  },

  // ── Animations (CSS keyframe animations, web-only) ────────────────────────
  // Each variant injects a @keyframes rule once via the __keyframe marker.
  // resolver.ts detects __keyframe, injects the rule, then strips the marker
  // so it never reaches element inline styles.
  animate: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (isArbitrary) return { animation: value.replace(/_/g, ' ') } as StyleValue;

    type AnimDef = { animation: string; __keyframe?: string };
    const defs: Record<string, AnimDef> = {
      none:   { animation: 'none' },
      spin:   {
        animation:   'kb-spin 1s linear infinite',
        __keyframe:  '@keyframes kb-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }',
      },
      ping:   {
        animation:   'kb-ping 1s cubic-bezier(0,0,0.2,1) infinite',
        __keyframe:  '@keyframes kb-ping { 75%, 100% { transform: scale(2); opacity: 0 } }',
      },
      pulse:  {
        animation:   'kb-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        __keyframe:  '@keyframes kb-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }',
      },
      bounce: {
        animation:   'kb-bounce 1s infinite',
        __keyframe:  '@keyframes kb-bounce { 0%, 100% { transform: translateY(-25%); animation-timing-function: cubic-bezier(0.8,0,1,1) } 50% { transform: none; animation-timing-function: cubic-bezier(0,0,0.2,1) } }',
      },
    };
    const def = defs[value];
    return def ? def as StyleValue : null;
  },

  // ── Line-clamp (web-only) ─────────────────────────────────────────────────
  'line-clamp': ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'none') return { overflow: 'visible', display: 'block', WebkitLineClamp: 'unset' } as StyleValue;
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) return null;
    return {
      overflow: 'hidden',
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: n,
    } as StyleValue;
  },

  // ── Caret color (web-only) ────────────────────────────────────────────────
  caret: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto' || value === 'transparent') return { caretColor: value } as StyleValue;
    const color = resolveColor(value, colors, isArbitrary);
    return color ? { caretColor: color } as StyleValue : null;
  },

  // ── Accent color (web-only) ───────────────────────────────────────────────
  accent: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    if (value === 'auto') return { accentColor: 'auto' } as StyleValue;
    const color = resolveColor(value, colors, isArbitrary);
    return color ? { accentColor: color } as StyleValue : null;
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
  basis: ({ value, isArbitrary }, { spacing }) => {
    const v = resolveSizing(value, spacing, isArbitrary);
    return v !== null ? { flexBasis: v } : null;
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

  // ── Gap ────────────────────────────────────────────────────────────────────
  gap: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { gap: v } : null;
  },
  'gap-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { columnGap: v } : null;
  },
  'gap-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { rowGap: v } : null;
  },

  // ── Position ───────────────────────────────────────────────────────────────
  top: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { top: v } : null;
  },
  right: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { right: v } : null;
  },
  bottom: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { bottom: v } : null;
  },
  left: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { left: v } : null;
  },
  inset: ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { top: v, right: v, bottom: v, left: v } : null;
  },
  'inset-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { left: v, right: v } : null;
  },
  'inset-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    return v !== null ? { top: v, bottom: v } : null;
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

  // ── Opacity ────────────────────────────────────────────────────────────────
  opacity: ({ value, isArbitrary }, { opacity }) => {
    if (isArbitrary) {
      // Accept raw float (0.5) or percentage-like (50)
      const v = parseFloat(value);
      return isNaN(v) ? null : { opacity: v > 1 ? v / 100 : v };
    }
    const v = opacity[value];
    if (v !== undefined) return { opacity: v };
    const n = parseFloat(value);
    return isNaN(n) ? null : { opacity: n > 1 ? n / 100 : n };
  },

  // ── Font ───────────────────────────────────────────────────────────────────
  font: ({ value, isArbitrary }, { fontFamily, fontWeight }) => {
    if (isArbitrary) return { fontFamily: value };
    // Font family
    if (value in fontFamily) {
      const ff = fontFamily[value];
      return { fontFamily: Array.isArray(ff) ? ff.join(', ') : ff };
    }
    // Font weight
    if (value in fontWeight) return { fontWeight: String(fontWeight[value]) };
    return null;
  },

  // ── Line height ────────────────────────────────────────────────────────────
  leading: ({ value, isArbitrary }, { lineHeight }) => {
    if (isArbitrary) return { lineHeight: getEffectiveIsWeb() ? value : toNativeValue(value) };
    const v = lineHeight[value];
    if (v === undefined) return null;
    // String values (e.g. '12px') pass through on web; convert to number for native
    if (typeof v === 'string' && !getEffectiveIsWeb()) return { lineHeight: toNativeValue(v) };
    return { lineHeight: v };
  },

  // ── Letter spacing ─────────────────────────────────────────────────────────
  tracking: ({ value, isArbitrary }, { letterSpacing }) => {
    if (isArbitrary) return { letterSpacing: getEffectiveIsWeb() ? value : toNativeValue(value) };
    const v = letterSpacing[value];
    return v !== undefined ? { letterSpacing: v } : null;
  },

  // ── Shadow ─────────────────────────────────────────────────────────────────
  shadow: ({ value }, { shadow }) => {
    const key = value === '' ? 'DEFAULT' : value;
    return shadow[key] ?? null;
  },

  // ── Scale ──────────────────────────────────────────────────────────────────
  // Non-arbitrary: scale-150 → value='150' → 150/100 = 1.5
  // Arbitrary:     scale-[1.5] → value='1.5' → used as-is (already the factor)
  scale: ({ value, isArbitrary }) => {
    const n = isArbitrary ? parseFloat(value) : parseFloat(value) / 100;
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `scale(${n})` }
      : { transform: [{ scale: n }] };
  },
  'scale-x': ({ value, isArbitrary }) => {
    const n = isArbitrary ? parseFloat(value) : parseFloat(value) / 100;
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `scaleX(${n})` }
      : { transform: [{ scaleX: n }] };
  },
  'scale-y': ({ value, isArbitrary }) => {
    const n = isArbitrary ? parseFloat(value) : parseFloat(value) / 100;
    if (isNaN(n)) return null;
    return getEffectiveIsWeb()
      ? { transform: `scaleY(${n})` }
      : { transform: [{ scaleY: n }] };
  },

  // ── Rotate ─────────────────────────────────────────────────────────────────
  rotate: ({ value, negative, isArbitrary }) => {
    if (isArbitrary) {
      // Pass value as-is so units (deg/rad/turn/grad) are preserved.
      // Both web CSS and React Native's rotate transform accept a string like '45deg'.
      const finalValue = negative ? `-${value}` : value;
      return getEffectiveIsWeb()
        ? { transform: `rotate(${finalValue})` }
        : { transform: [{ rotate: finalValue }] };
    }
    const deg = parseFloat(value);
    if (isNaN(deg)) return null;
    const finalDeg = negative ? -deg : deg;
    return getEffectiveIsWeb()
      ? { transform: `rotate(${finalDeg}deg)` }
      : { transform: [{ rotate: `${finalDeg}deg` }] };
  },

  // ── Translate ──────────────────────────────────────────────────────────────
  'translate-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    if (getEffectiveIsWeb()) return { transform: `translateX(${v})` };
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return isNaN(n) ? null : { transform: [{ translateX: n }] };
    }
    return { transform: [{ translateX: v }] };
  },
  'translate-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    if (getEffectiveIsWeb()) return { transform: `translateY(${v})` };
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return isNaN(n) ? null : { transform: [{ translateY: n }] };
    }
    return { transform: [{ translateY: v }] };
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

  // ── Transition (web-only; use Animated API on native) ─────────────────────
  transition: ({ value }) => {
    if (!getEffectiveIsWeb()) return null;
    const presets: Record<string, string> = {
      '': 'color 150ms, background-color 150ms, border-color 150ms, text-decoration-color 150ms, fill 150ms, stroke 150ms, opacity 150ms, box-shadow 150ms, transform 150ms, filter 150ms, backdrop-filter 150ms',
      all: 'all 150ms',
      none: 'none',
      colors: 'color 150ms, background-color 150ms, border-color 150ms',
      opacity: 'opacity 150ms',
      shadow: 'box-shadow 150ms',
      transform: 'transform 150ms',
    };
    const v = presets[value];
    return v !== undefined ? { transition: v } : null;
  },

  duration: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    const ms = isArbitrary ? value : `${value}ms`;
    return { transitionDuration: ms };
  },

  delay: ({ value, isArbitrary }) => {
    if (!getEffectiveIsWeb()) return null;
    if (!isArbitrary && isNaN(parseFloat(value))) return null;
    const ms = isArbitrary ? value : `${value}ms`;
    return { transitionDelay: ms };
  },

  // ── Ring (web-only: box-shadow outline ring) ──────────────────────────────
  ring: ({ value, isArbitrary }, { colors }) => {
    if (!getEffectiveIsWeb()) return null;
    const DEFAULT_COLOR = 'rgba(59, 130, 246, 0.5)';
    const DEFAULT_WIDTH = 3;

    if (!value) {
      return { boxShadow: `0 0 0 ${DEFAULT_WIDTH}px ${DEFAULT_COLOR}` } as StyleValue;
    }

    if (value === 'inset') {
      return { boxShadow: `inset 0 0 0 ${DEFAULT_WIDTH}px ${DEFAULT_COLOR}` } as StyleValue;
    }

    const widthTokens: Record<string, number> = { '0': 0, '1': 1, '2': 2, '4': 4, '8': 8 };
    if (!isArbitrary && value in widthTokens) {
      const w = widthTokens[value]!;
      return { boxShadow: w === 0 ? 'none' : `0 0 0 ${w}px ${DEFAULT_COLOR}` } as StyleValue;
    }

    if (isArbitrary) {
      const numMatch = /^(\d+(?:\.\d+)?)(px|rem|em|vw|vh)?$/.exec(value);
      if (numMatch) {
        const unit = numMatch[2] ?? 'px';
        return { boxShadow: `0 0 0 ${numMatch[1]}${unit} ${DEFAULT_COLOR}` } as StyleValue;
      }
      // Treat as full box-shadow string (underscores → spaces)
      return { boxShadow: value.replace(/_/g, ' ') } as StyleValue;
    }

    const color = resolveColor(value, colors, false);
    if (color) return { boxShadow: `0 0 0 ${DEFAULT_WIDTH}px ${color}` } as StyleValue;

    return null;
  },

  'ring-offset': ({ value, isArbitrary }, _theme) => {
    if (!getEffectiveIsWeb()) return null;
    const DEFAULT_RING_COLOR = 'rgba(59, 130, 246, 0.5)';
    const DEFAULT_RING_WIDTH = 3;

    const offsetTokens: Record<string, number> = { '0': 0, '1': 1, '2': 2, '4': 4, '8': 8 };
    // Arbitrary values keep whatever unit the caller supplied (e.g. "0.5rem")
    // instead of assuming px — a bare numeric string still resolves to a number.
    let offsetWidth: string | number | null;
    if (!isArbitrary) {
      offsetWidth = value in offsetTokens ? offsetTokens[value]! : null;
    } else {
      offsetWidth = /^-?\d+(\.\d+)?$/.test(value) ? parseFloat(value) : value;
    }

    if (offsetWidth === null || (typeof offsetWidth === 'number' && isNaN(offsetWidth))) return null;

    const isZero = offsetWidth === 0 || offsetWidth === '0';
    const offsetCss = typeof offsetWidth === 'number' ? `${offsetWidth}px` : offsetWidth;

    return {
      boxShadow: isZero
        ? `0 0 0 ${DEFAULT_RING_WIDTH}px ${DEFAULT_RING_COLOR}`
        : `0 0 0 ${offsetCss} #fff, 0 0 0 calc(${offsetCss} + ${DEFAULT_RING_WIDTH}px) ${DEFAULT_RING_COLOR}`,
    } as StyleValue;
  },

  // ── Space between ─────────────────────────────────────────────────────────
  // On web: emits __spaceX/__spaceY markers → resolver generates > * + * CSS rules.
  // On native (RN 0.71+): uses columnGap/rowGap directly.
  'space-x': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    if (getEffectiveIsWeb()) return { __spaceX: v } as StyleValue;
    return { columnGap: v };
  },
  'space-y': ({ value, negative, isArbitrary }, { spacing }) => {
    const v = resolveSpacing(value, negative, spacing, isArbitrary);
    if (v === null) return null;
    if (getEffectiveIsWeb()) return { __spaceY: v } as StyleValue;
    return { rowGap: v };
  },
};

// ─── Public resolver ─────────────────────────────────────────────────────────

export function resolveUtility(parsed: ParsedClass, theme: ThemeConfig): StyleValue | null {
  if (!parsed.value) {
    if (parsed.utility in PLUGIN_STANDALONE) return PLUGIN_STANDALONE[parsed.utility] ?? null;
    if (parsed.utility in getStandalone()) return getStandalone()[parsed.utility] ?? null;
  }

  const resolver = PLUGIN_RESOLVERS[parsed.utility] ?? RESOLVERS[parsed.utility];
  if (resolver) return resolver(parsed, theme);

  return null;
}

// ─── Plugin-isolated maps ─────────────────────────────────────────────────────
// Cleared before each buildConfig() run so stale entries don't survive plugin changes.

const PLUGIN_STANDALONE: Record<string, StyleValue | null> = {};
const PLUGIN_RESOLVERS: Record<string, Resolver> = {};

export function clearPluginUtilities(): void {
  for (const key of Object.keys(PLUGIN_STANDALONE)) delete PLUGIN_STANDALONE[key];
  for (const key of Object.keys(PLUGIN_RESOLVERS)) delete PLUGIN_RESOLVERS[key];
  // Invalidate parser-facing caches so new plugin utilities are picked up.
  _sortedPrefixes = null;
  _standaloneNames = null;
}

export function getPluginStandaloneMap(): Record<string, StyleValue | null> {
  return PLUGIN_STANDALONE;
}

export function getPluginResolverMap(): Record<string, Resolver> {
  return PLUGIN_RESOLVERS;
}

/**
 * Returns true if the utility name is known to the framework (built-in or plugin).
 * Used for dev-mode warnings — resolveUtility returning null could mean either
 * "intentionally null on this platform" or "completely unknown utility name".
 * This check covers the second case.
 */
export function isKnownUtility(utility: string): boolean {
  return (
    utility in getStandalone() ||
    utility in RESOLVERS ||
    utility in PLUGIN_STANDALONE ||
    utility in PLUGIN_RESOLVERS
  );
}

// ─── Parser-facing exports ────────────────────────────────────────────────────
// These let parser.ts derive its prefix/standalone lists directly from the
// resolver maps — adding a new utility to RESOLVERS or buildStandalone()
// is now the ONLY edit required.

let _sortedPrefixes: readonly string[] | null = null;
let _standaloneNames: ReadonlySet<string> | null = null;

/**
 * Sorted (longest-first) unique list of all built-in + plugin utility prefixes.
 * Used by parser.ts for greedy prefix matching — replaces the hard-coded
 * UTILITY_PREFIXES array that had to be kept in sync manually.
 */
export function getBuiltinUtilityPrefixes(): readonly string[] {
  if (!_sortedPrefixes) {
    const all = [...new Set([...Object.keys(RESOLVERS), ...Object.keys(PLUGIN_RESOLVERS)])];
    _sortedPrefixes = all.sort((a, b) => b.length - a.length);
  }
  return _sortedPrefixes;
}

/**
 * Set of all built-in + plugin standalone utility names.
 * Used by parser.ts to recognise no-value tokens — replaces the hard-coded
 * STANDALONE_UTILITIES set that had to be kept in sync manually.
 */
export function getBuiltinStandaloneNames(): ReadonlySet<string> {
  if (!_standaloneNames) {
    _standaloneNames = new Set([...Object.keys(getStandalone()), ...Object.keys(PLUGIN_STANDALONE)]);
  }
  return _standaloneNames;
}
