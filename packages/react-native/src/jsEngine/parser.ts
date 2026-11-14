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
  'leading-', 'tracking-', 'font-', 'align-',
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
  /**
   * The text after the `/` of an arbitrary value when it isn't an opacity:
   * the line height of `text-[14px]/[20px]` (`[20px]`), as written. Only
   * `text-` keeps one — mirrors parser.rs's `modifier`.
   */
  modifier?: string | null;
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
  'bg-size', 'family-name', 'generic-name', 'absolute-size', 'relative-size', 'angle', 'shadow', 'any',
]);

/**
 * A bracketed or variable modifier after a `/` (`text-sm/[20px]`,
 * `text-sm/(--lh)`): its CSS value, with an arbitrary value's rules
 * (underscores are spaces, unsafe text is refused). Null otherwise
 * (parser.rs `arbitrary_modifier`).
 */
export function arbitraryModifier(modifier: string): string | null {
  const bracketed = parenVarShorthand(modifier) ?? modifier;
  if (!(bracketed.length > 2 && bracketed.startsWith('[') && bracketed.endsWith(']'))) return null;
  const raw = bracketed.slice(1, -1);
  if (!isSafeArbitraryValue(raw)) return null;
  return normalizeMathWhitespace(raw.replace(/_/g, ' '));
}

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

/**
 * `[#c7a25d]/40` -> ['[#c7a25d]', '40']; `[14px]/[20px]` -> ['[14px]', '[20px]'].
 * Split at the `/` right after the bracket that closes the first one, so a
 * slash inside the brackets is never split (parser.rs `split_bracket_modifier`).
 */
function splitBracketModifier(value: string): [string, string | null] {
  if (!value.startsWith('[')) return [value, null];
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        const after = value.slice(i + 1);
        return after.startsWith('/') && after.length > 1 ? [value.slice(0, i + 1), after.slice(1)] : [value, null];
      }
    }
  }
  return [value, null];
}

/**
 * An opacity modifier (parser.rs `Alpha`): a 0-1 fraction (`/50` is 0.5,
 * `/2.5` is 0.025, `/[0.37]`, `/[37%]`), or a runtime CSS value
 * (`/(--o)`, `/[calc(…)]`).
 */
export type Alpha = { fraction: number } | { raw: string };

/** A number without float noise: 57, not 56.99999999999999 (parser.rs `trim_number`). */
export function trimNumber(n: number): string {
  return `${Math.round(n * 1_000_000) / 1_000_000}`;
}

/** parser.rs `parse_alpha`; null for anything that isn't an opacity (`[20px]`, `150`). */
export function parseAlpha(modifier: string): Alpha | null {
  const raw = arbitraryModifier(modifier);
  if (raw !== null) {
    if (raw.endsWith('%')) {
      const n = strictNumber(raw.slice(0, -1));
      return n !== null && n >= 0 && n <= 100 ? { fraction: n / 100 } : null;
    }
    const n = strictNumber(raw);
    if (n !== null) return n >= 0 && n <= 1 ? { fraction: n } : null;
    return raw.startsWith('var(') || raw.startsWith('calc(') ? { raw } : null;
  }
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(modifier)) return null;
  const n = Number(modifier);
  return n <= 100 ? { fraction: n / 100 } : null;
}

/** A plain decimal number, the shapes Rust's `f64::from_str` takes here; null otherwise. */
function strictNumber(text: string): number | null {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text) ? Number(text) : null;
}

/**
 * Tailwind v4's CSS functions inside an arbitrary value, as plain CSS:
 * `--spacing(4)` is `16px`, `--alpha(red / 50%)` is a `color-mix()`
 * (parser.rs `expand_theme_functions`).
 */
function expandThemeFunctions(raw: string): string {
  if (!raw.includes('--spacing(') && !raw.includes('--alpha(')) return raw;
  let out = '';
  let rest = raw;
  for (;;) {
    const found = (['--spacing(', '--alpha('] as const)
      .map((name) => ({ name, at: rest.indexOf(name) }))
      .filter((f) => f.at !== -1)
      .sort((a, b) => a.at - b.at)[0];
    if (found === undefined) break;
    const argsFrom = found.at + found.name.length;
    let depth = 1;
    let close = -1;
    for (let i = argsFrom; i < rest.length; i++) {
      if (rest[i] === '(') depth += 1;
      else if (rest[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close === -1) break;
    const arg = expandThemeFunctions(rest.slice(argsFrom, close).trim());
    out += rest.slice(0, found.at);
    if (found.name === '--spacing(') {
      const n = strictNumber(arg);
      out += n !== null ? `${trimNumber(n * 4)}px` : `calc(4px * ${arg})`;
    } else {
      const slash = arg.lastIndexOf('/');
      if (slash === -1) {
        out += arg;
      } else {
        const alpha = arg.slice(slash + 1).trim();
        const n = strictNumber(alpha);
        out += `color-mix(in srgb, ${arg.slice(0, slash).trim()} ${n !== null ? `${trimNumber(n * 100)}%` : alpha}, transparent)`;
      }
    }
    rest = rest.slice(close + 1);
  }
  return out + rest;
}

const COLOR_FUNCTIONS = ['rgb(', 'rgba(', 'hsl(', 'hsla(', 'hwb(', 'lab(', 'lch(', 'oklab(', 'oklch(', 'color(', 'color-mix(', 'var('];

/** Hex, a color function, var(), or a bare word (parser.rs `looks_like_color`). */
function looksLikeColor(value: string): boolean {
  return value.startsWith('#') || COLOR_FUNCTIONS.some((f) => value.startsWith(f)) || /^[A-Za-z]+$/.test(value);
}

/** rgba() for #rgb/#rrggbb with a known alpha, color-mix() otherwise (parser.rs `color_with_opacity`). */
export function colorWithOpacity(color: string, alpha: Alpha): string {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (m && 'fraction' in alpha) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgba(${r},${g},${b},${trimNumber(alpha.fraction)})`;
  }
  return `color-mix(in srgb, ${color} ${'fraction' in alpha ? `${trimNumber(alpha.fraction * 100)}%` : alpha.raw}, transparent)`;
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
        const value = normalizeMathWhitespace(expandThemeFunctions(rawValue.replace(/_/g, ' ')));
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
    // `p-(--gap)` -> `p-[var(--gap)]`, and the modifier after an arbitrary
    // value (an opacity on a color, `bg-[#c7a25d]/40`, or a line height on
    // a size, `text-[14px]/[20px]`) split off — parser.rs's identical steps.
    const [value, tail] = splitBracketModifier(parenVarShorthand(written) ?? written);

    if (value.length >= 2 && value.startsWith('[') && value.endsWith(']')) {
      const raw = value.slice(1, -1);
      if (!isSafeArbitraryValue(raw)) {
        // Unsafe arbitrary value — treat as unresolvable, keep scanning
        // (mirrors Rust's `continue` — a later, shorter prefix might still match).
        continue;
      }
      const spaced = normalizeMathWhitespace(expandThemeFunctions(raw.replace(/_/g, ' ')));
      let [typeHint, hinted] = splitTypeHint(spaced);
      let modifier: string | null = null;
      if (tail !== null) {
        const isColor = typeHint === 'color' || (typeHint === null && looksLikeColor(hinted));
        const alpha = isColor ? parseAlpha(tail) : null;
        if (alpha !== null) {
          hinted = colorWithOpacity(hinted, alpha);
          typeHint = 'color';
        } else if (prefix === 'text-') {
          // `text-[14px]/[20px]`: the size's line height
          modifier = tail;
        } else {
          // Only a color takes an opacity; `w-[10px]/50` resolves to nothing.
          continue;
        }
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
        modifier,
      };
    }

    return {
      modifiers,
      utility: prefix.slice(0, -1),
      // a named value keeps its own /opacity (`bg-blue-6/50`)
      value: tail === null ? value : `${value}/${tail}`,
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
