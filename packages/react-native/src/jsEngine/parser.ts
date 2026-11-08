/**
 * Pure-JS port of `packages/core-engine/src/parser.rs`'s `parse_class` —
 * the tokenizer for a single class-string token (e.g.
 * "dark:hover:!bg-[#6366f1]") into its modifier chain, base utility name,
 * value, and important flag. Exists so Expo Go (which can never load a
 * WASM module via Hermes, nor any custom native/TurboModule) has a
 * fallback resolution path — see nativeBridge.js.ts's own doc comment for
 * where this gets wired in.
 *
 * This is a byte-for-byte port, not a reinterpretation: keep it in sync by
 * diffing against parser.rs whenever that file changes. `VALUE_PREFIXES`
 * in particular must stay in the exact same order — longer prefixes that
 * share a shorter prefix with another entry (e.g. "gap-x-" vs "gap-") MUST
 * come first, or the shorter one wrongly claims the match.
 */

/** Utility prefixes (including their trailing "-") that take a value after the dash. */
const VALUE_PREFIXES: readonly string[] = [
  'bg-opacity-', 'text-opacity-', 'bg-blend-', 'text-shadow-', 'bg-', 'text-',
  'border-x-', 'border-y-', 'border-t-', 'border-r-', 'border-b-', 'border-l-', 'border-',
  'caret-', 'accent-', 'fill-', 'stroke-width-', 'stroke-',
  'resize-', 'touch-', 'will-change-',
  'scroll-mx-', 'scroll-my-', 'scroll-mt-', 'scroll-mr-', 'scroll-mb-', 'scroll-ml-', 'scroll-m-',
  'scroll-px-', 'scroll-py-', 'scroll-pt-', 'scroll-pr-', 'scroll-pb-', 'scroll-pl-', 'scroll-p-',
  'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'p-',
  'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'm-',
  'gap-x-', 'gap-y-', 'gap-',
  'min-w-', 'max-w-', 'w-',
  'min-h-', 'max-h-', 'h-',
  'size-', 'basis-',
  'rounded-tl-', 'rounded-tr-', 'rounded-br-', 'rounded-bl-',
  'rounded-t-', 'rounded-r-', 'rounded-b-', 'rounded-l-', 'rounded-',
  'ring-offset-', 'ring-', 'outline-offset-', 'outline-', 'shadow-', 'opacity-',
  'duration-', 'delay-', 'ease-', 'cursor-', 'mix-blend-', 'animate-',
  'leading-', 'tracking-', 'font-',
  'z-', 'inset-x-', 'inset-y-', 'inset-', 'top-', 'right-', 'bottom-', 'left-', 'start-', 'end-',
  'overflow-x-', 'overflow-y-', 'overscroll-x-', 'overscroll-y-', 'overscroll-', 'aspect-',
  'divide-color-', 'space-x-', 'space-y-',
  'flex-', 'grow-', 'shrink-', 'order-',
  'grid-cols-', 'grid-rows-', 'grid-flow-', 'auto-cols-', 'auto-rows-',
  'col-span-', 'col-start-', 'col-end-', 'col-',
  'row-span-', 'row-start-', 'row-end-', 'row-',
  'place-items-', 'place-content-', 'place-self-', 'justify-items-', 'justify-self-',
  'scale-x-', 'scale-y-', 'scale-z-', 'scale-',
  'rotate-x-', 'rotate-y-', 'rotate-z-', 'rotate-',
  // Bare 'translate-'/'skew-' (both axes) after their per-axis forms, same
  // longer-before-shorter rule as resolvers/parser.rs.
  'translate-x-', 'translate-y-', 'translate-z-', 'translate-', 'skew-x-', 'skew-y-', 'skew-',
  'perspective-origin-', 'perspective-', 'origin-',
  'blur-', 'brightness-', 'contrast-', 'grayscale-', 'hue-rotate-',
  'invert-', 'saturate-', 'sepia-', 'drop-shadow-', 'filter-',
  'backdrop-blur-', 'backdrop-brightness-', 'backdrop-contrast-',
  'backdrop-grayscale-', 'backdrop-hue-rotate-', 'backdrop-invert-',
  'backdrop-opacity-', 'backdrop-saturate-', 'backdrop-sepia-', 'backdrop-filter-',
  'decoration-', 'underline-offset-', 'indent-',
  'from-', 'via-', 'to-',
];

/** Sentinel utility name for arbitrary properties (`[mask-type:luminance]`) — web-only in practice (RN has no arbitrary-CSS-property concept), kept here for parser parity. */
export const ARBITRARY_PROPERTY_SENTINEL = '[arbitrary-property]';

export interface ParsedClass {
  /** Modifier chain in source order, e.g. ["dark", "hover"] for "dark:hover:bg-blue-6". */
  modifiers: string[];
  /** Base utility name, e.g. "bg", "p", "flex", "items-center". */
  utility: string;
  /** Value after the utility's "-", e.g. "blue-6", "4", or a raw arbitrary value with its brackets stripped. */
  value: string | null;
  /** True if `value` came from bracket syntax (`bg-[#6366f1]`) rather than a named theme-scale lookup. */
  isArbitrary: boolean;
  /**
   * A Tailwind type hint stripped from the start of an arbitrary value
   * (`text-[length:var(--x)]` has value `var(--x)`, hint `length`) — mirrors
   * parser.rs's `type_hint`.
   */
  typeHint?: string | null;
  /** True if the token had a leading "!" (after its modifier chain). */
  important: boolean;
  /**
   * True if the token had a leading "-" (after its modifier chain and any
   * "!", e.g. "-mt-4" or "hover:-mt-4") — real Tailwind's own
   * negative-value convention. Only meaningful to the specific resolvers
   * that opt into it (margin, inset, z-index, order — see
   * `resolveNegatableLength` in shared.ts); every other resolver ignores
   * this field entirely, the same way most already ignore `important`.
   */
  negative: boolean;
  /** The full original token text, unmodified. */
  original: string;
}

/** Rejects arbitrary values that could smuggle extra CSS declarations/selectors — a value containing `{`, `}`, or `;`. Only used within this file — not part of the jsEngine's public surface. */
function isSafeArbitraryValue(value: string): boolean {
  return !value.includes('{') && !value.includes('}') && !value.includes(';');
}

/**
 * Port of `parser.rs`'s `normalize_math_whitespace` — see that function's
 * own doc comment for the full reasoning (unary-vs-binary `+`/`-`
 * disambiguation, `var(...)` treated as opaque, the scientific-notation
 * caveat). Native doesn't strictly NEED this the way web does (real CSS
 * requires whitespace around a binary `+`/`-`; this engine's own
 * `reduceConstantMath`/`layoutCalc.ts` evaluators already tolerate zero
 * spacing on their own), but it's ported anyway to keep the actual PARSED
 * value identical to what parser.rs produces for the same input — this
 * file's own doc comment already commits to staying byte-for-byte in sync.
 */
function normalizeMathWhitespace(raw: string): string {
  if (!(raw.startsWith('calc(') || raw.startsWith('min(') || raw.startsWith('max(') || raw.startsWith('clamp('))) {
    return raw;
  }

  const chars = Array.from(raw);
  let out = '';
  let i = 0;
  // Whether the character just emitted could END a value — true right
  // after a digit/unit/`%`/`)`, meaning a following `+`/`-` is binary;
  // false at the start, or right after `(`/`,`/another operator, meaning
  // it's unary and stays glued to what follows.
  let prevEndsValue = false;

  while (i < chars.length) {
    const c = chars[i]!;

    // `var(` — copy through verbatim up to its matching `)`, untouched,
    // rather than reading its contents as arithmetic at all.
    if (c === 'v' && chars[i + 1] === 'a' && chars[i + 2] === 'r' && chars[i + 3] === '(') {
      const start = i;
      let depth = 0;
      while (i < chars.length) {
        if (chars[i] === '(') depth++;
        else if (chars[i] === ')') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      out += chars.slice(start, i).join('');
      prevEndsValue = true;
      continue;
    }

    if (c === '+' || c === '-') {
      if (prevEndsValue) {
        out += ` ${c} `;
        i++;
        // Don't double up if the author already wrote spacing (or
        // underscores, already converted to spaces above).
        while (i < chars.length && /\s/.test(chars[i]!)) i++;
        prevEndsValue = false;
        continue;
      }
      out += c; // unary — glued to the number that follows
      prevEndsValue = false;
    } else if (c === '(' || c === ',') {
      out += c;
      if (c === ',') out += ' ';
      prevEndsValue = false;
    } else if (c === ')') {
      out += c;
      prevEndsValue = true;
    } else if (/\s/.test(c)) {
      // Dropped — the '+'/'-' branch above is solely responsible for the
      // whitespace THIS function emits; any other whitespace (around
      // `*`/`/`, inside a bare number) means nothing to CSS either way.
    } else if (c === '*' || c === '/') {
      out += c;
      prevEndsValue = false; // `2*-3`/`2/-3` — the sign stays unary
    } else {
      // A digit, unit letter, or '%' — anything else that can end a value.
      out += c;
      prevEndsValue = true;
    }
    i++;
  }
  return out;
}

/** The type hints Tailwind CSS accepts at the start of an arbitrary value (parser.rs `TYPE_HINTS`). */
const TYPE_HINTS = new Set([
  'color', 'length', 'size', 'line-width', 'percentage', 'number', 'integer', 'image', 'url', 'position',
  'bg-size', 'family-name', 'absolute-size', 'relative-size', 'angle', 'shadow', 'any',
]);

/** `length:var(--x)` -> ['length', 'var(--x)']; no known hint -> [null, raw]. */
function splitTypeHint(raw: string): [string | null, string] {
  const i = raw.indexOf(':');
  if (i > 0 && i < raw.length - 1 && TYPE_HINTS.has(raw.slice(0, i))) return [raw.slice(0, i), raw.slice(i + 1)];
  return [null, raw];
}

/** `(--gap)` -> `[var(--gap)]`, `(length:--x)` -> `[length:var(--x)]`, `(--b)/50` -> `[var(--b)]/50` (parser.rs `paren_var_shorthand`). */
function parenVarShorthand(value: string): string | null {
  const m = /^\((?:([a-z-]+):)?--([A-Za-z0-9_-]+)\)(\/.*)?$/.exec(value);
  if (!m) return null;
  const [, hint, name, tail = ''] = m;
  if (hint !== undefined && !TYPE_HINTS.has(hint)) return null;
  return hint ? `[${hint}:var(--${name})]${tail}` : `[var(--${name})]${tail}`;
}

/** `[#c7a25d]/40` -> ['[#c7a25d]', 40] (parser.rs `split_arbitrary_opacity`). */
function splitArbitraryOpacity(value: string): [string, number | null] {
  if (value.startsWith('[')) {
    const i = value.lastIndexOf(']/');
    if (i !== -1) {
      const pct = value.slice(i + 2);
      if (/^\d+$/.test(pct) && Number(pct) <= 100) return [value.slice(0, i + 1), Number(pct)];
    }
  }
  return [value, null];
}

const COLOR_FUNCTIONS = ['rgb(', 'rgba(', 'hsl(', 'hsla(', 'hwb(', 'lab(', 'lch(', 'oklab(', 'oklch(', 'color(', 'color-mix(', 'var('];

/** Hex, a color function, var(), or a bare word (parser.rs `looks_like_color`). */
function looksLikeColor(value: string): boolean {
  return value.startsWith('#') || COLOR_FUNCTIONS.some((f) => value.startsWith(f)) || /^[A-Za-z]+$/.test(value);
}

/** rgba() for #rgb/#rrggbb, color-mix() otherwise (parser.rs `color_with_opacity`). */
function colorWithOpacity(color: string, pct: number): string {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${pct / 100})`;
  }
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/**
 * Splits on ':' the same way `string.split(':')` would, except a ':' nested
 * inside a `[...]` bracket never counts as a separator. Exported (not just
 * an internal `parseClass` helper) so `jsxRuntimeCore.ts` can reuse the
 * exact same bracket-safe modifier-chain splitting for `hover:`/`focus:`/
 * `disabled:` token rewriting, instead of re-deriving this logic a second
 * time (see that file's own `stripModifiers` doc comment).
 */
export function splitRespectingBrackets(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    // Parentheses too: the `:` in `text-(length:--size)` is a type hint.
    if (ch === '[' || ch === '(') depth += 1;
    else if (ch === ']' || ch === ')') depth -= 1;
    else if (ch === ':' && depth <= 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(token.slice(start));
  return parts;
}

export function parseClass(token: string): ParsedClass {
  const parts = splitRespectingBrackets(token);
  let base = parts.pop() ?? token;
  const modifiers = parts;

  // `!p-4`, and Tailwind v4's `p-4!` (important at the end).
  const important = base.startsWith('!') || (base.length > 1 && base.endsWith('!'));
  if (base.startsWith('!')) {
    base = base.slice(1);
  } else if (important) {
    base = base.slice(0, -1);
  }

  // Real Tailwind's negative-value convention ("-mt-4", "-inset-2") — a
  // leading "-" on the utility itself, after any "!important" prefix but
  // before the utility-name matching below. No existing utility name or
  // VALUE_PREFIXES entry starts with "-", so stripping it unconditionally
  // here is safe (never shadows a real prefix).
  const negative = base.startsWith('-');
  if (negative) {
    base = base.slice(1);
  }

  // Arbitrary properties — a bracket-only token with no preceding
  // utility-name prefix at all, checked BEFORE the VALUE_PREFIXES loop
  // since no prefix entry could ever match a bracket starting at position 0.
  if (base.length >= 2 && base.startsWith('[') && base.endsWith(']')) {
    const raw = base.slice(1, -1);
    const colonIdx = raw.indexOf(':');
    if (colonIdx !== -1) {
      const property = raw.slice(0, colonIdx);
      const rawValue = raw.slice(colonIdx + 1);
      if (property !== '' && rawValue !== '' && isSafeArbitraryValue(raw)) {
        const value = normalizeMathWhitespace(rawValue.replace(/_/g, ' '));
        return {
          modifiers,
          utility: ARBITRARY_PROPERTY_SENTINEL,
          value: `${property}:${value}`,
          isArbitrary: true,
          important,
          negative,
          original: token,
        };
      }
    }
  }

  for (const prefix of VALUE_PREFIXES) {
    if (!base.startsWith(prefix)) continue;
    const written = base.slice(prefix.length);
    if (written === '') continue;
    // `p-(--gap)` -> `p-[var(--gap)]`, and an opacity on an arbitrary
    // color (`bg-[#c7a25d]/40`) split off — parser.rs's identical steps.
    const [value, arbitraryOpacity] = splitArbitraryOpacity(parenVarShorthand(written) ?? written);

    if (value.length >= 2 && value.startsWith('[') && value.endsWith(']')) {
      const raw = value.slice(1, -1);
      if (!isSafeArbitraryValue(raw)) {
        // Unsafe arbitrary value — treat as unresolvable, keep scanning
        // (mirrors Rust's `continue` — a later, shorter prefix might still match).
        continue;
      }
      const spaced = normalizeMathWhitespace(raw.replace(/_/g, ' '));
      let [typeHint, hinted] = splitTypeHint(spaced);
      if (arbitraryOpacity !== null) {
        // Only a color takes an opacity; `w-[10px]/50` resolves to nothing.
        if (!(typeHint === 'color' || (typeHint === null && looksLikeColor(hinted)))) continue;
        hinted = colorWithOpacity(hinted, arbitraryOpacity);
        typeHint = 'color';
      }
      return {
        modifiers,
        utility: prefix.slice(0, -1),
        value: hinted,
        typeHint,
        isArbitrary: true,
        important,
        negative,
        original: token,
      };
    }

    return {
      modifiers,
      utility: prefix.slice(0, -1),
      // a named value keeps its own /opacity (`bg-blue-6/50`)
      value: arbitraryOpacity === null ? value : `${value}/${arbitraryOpacity}`,
      isArbitrary: false,
      important,
      negative,
      original: token,
    };
  }

  return {
    modifiers,
    utility: base,
    value: null,
    isArbitrary: false,
    important,
    negative,
    original: token,
  };
}
