/**
 * A tiny class-name composer — combine strings, arrays, and objects (with
 * boolean values) into one space-separated className, skipping anything
 * falsy. Matches the widely-used `clsx` npm package's public API and
 * behavior exactly (a from-scratch reimplementation, not a fork or a thin
 * wrapper around it) — this package ships its own copy so using it adds
 * zero runtime dependencies, and so it works identically whether or not
 * `clsx`/`classnames` happens to already be installed.
 *
 * Kbach class strings never NEED this — a Kbach `className` is just a
 * plain string, composable with plain JS (`"bg-" + color + "-6"`,
 * `[base, active && "opacity-100"].join(" ")`, see this package's own
 * README) with no special API required. This exists purely as an
 * ergonomic convenience for the common "several conditional classes on one
 * element" shape, for anyone who'd rather write it declaratively:
 *
 * ```ts
 * clsx("px-4 py-2", isActive && "bg-blue-6", { "opacity-50": disabled });
 * // "px-4 py-2 bg-blue-6" (when isActive is true and disabled is false)
 * ```
 *
 * Identical to `@kbach/react`'s own `clsx.ts` — deliberately duplicated
 * rather than factored into a shared package, since this is genuinely all
 * there is to it and a whole extra published package for one ~20-line
 * function would be more ceremony than the thing itself.
 */

/** Anything `clsx` accepts as one argument — recursively, for arrays. */
export type ClassValue = ClassArray | ClassDictionary | string | number | bigint | boolean | null | undefined;

/** A key is kept (as a literal class name) only when its value is truthy — `{ "opacity-50": disabled }`. */
export interface ClassDictionary {
  [className: string]: unknown;
}

export type ClassArray = ClassValue[];

/**
 * Joins every truthy piece across all arguments with a single space,
 * skipping falsy values (`false`, `null`, `undefined`, `0`, `""`, `NaN`)
 * entirely — they contribute nothing, not even an extra space. Arrays are
 * flattened (recursively, to any depth); a plain object keeps only the
 * keys whose value is truthy.
 */
export function clsx(...inputs: ClassValue[]): string {
  let out = '';
  for (const input of inputs) {
    const piece = resolveClassValue(input);
    if (piece) out = out ? `${out} ${piece}` : piece;
  }
  return out;
}

function resolveClassValue(value: ClassValue): string {
  // Covers false/null/undefined/0/""/NaN in one check — none of these ever
  // contribute a class, regardless of which of those exact falsy values it
  // is. A non-empty string is always truthy here (even the literal text
  // "0"), so this can't misfire on a real class name.
  if (!value) return '';

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'bigint') return String(value);

  if (Array.isArray(value)) return clsx(...value);

  if (type === 'object') {
    let out = '';
    for (const key in value as ClassDictionary) {
      if (Object.prototype.hasOwnProperty.call(value, key) && (value as ClassDictionary)[key]) {
        out = out ? `${out} ${key}` : key;
      }
    }
    return out;
  }

  return '';
}
