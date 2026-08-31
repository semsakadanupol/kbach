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
  'translate-x-', 'translate-y-', 'translate-z-', 'skew-x-', 'skew-y-',
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
    if (ch === '[') depth += 1;
    else if (ch === ']') depth -= 1;
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

  const important = base.startsWith('!');
  if (important) {
    base = base.slice(1);
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
        const value = rawValue.replace(/_/g, ' ');
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
    const value = base.slice(prefix.length);
    if (value === '') continue;

    if (value.length >= 2 && value.startsWith('[') && value.endsWith(']')) {
      const raw = value.slice(1, -1);
      if (!isSafeArbitraryValue(raw)) {
        // Unsafe arbitrary value — treat as unresolvable, keep scanning
        // (mirrors Rust's `continue` — a later, shorter prefix might still match).
        continue;
      }
      const spaced = raw.replace(/_/g, ' ');
      return {
        modifiers,
        utility: prefix.slice(0, -1),
        value: spaced,
        isArbitrary: true,
        important,
        negative,
        original: token,
      };
    }

    return {
      modifiers,
      utility: prefix.slice(0, -1),
      value,
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
