import type { ParsedClass } from './types';
import { isKnownModifier, getAllModifierNames } from './registry';
import { getBuiltinUtilityPrefixes, getBuiltinStandaloneNames } from './utilities';
import { kbachWarn } from './devWarn';

// ─── Parser ───────────────────────────────────────────────────────────────────
// Modifiers, utility prefixes, and standalone names are no longer hardcoded here.
// They are derived from registry.ts (modifiers) and utilities.ts (utility names)
// so that adding a new modifier or utility only requires editing ONE file.

export function parseClass(className: string): ParsedClass | null {
  const trimmed = className.trim();
  if (!trimmed) return null;

  // ── 1. Extract modifiers ────────────────────────────────────────────────────
  // No hard cap (#5): parse as many recognised modifiers as the string contains.
  const modifiers: string[] = [];
  let remaining = trimmed;

  while (true) {
    const colonIdx = findOuterColon(remaining);
    if (colonIdx === -1) break;
    const candidate = remaining.slice(0, colonIdx);
    if (!isKnownModifier(candidate)) break;
    modifiers.push(candidate);
    remaining = remaining.slice(colonIdx + 1);
  }

  // ── 2. Important prefix  (!p-4) ─────────────────────────────────────────────
  let important = false;
  if (remaining.startsWith('!') && remaining.length > 1) {
    important = true;
    remaining = remaining.slice(1);
  }

  // ── 3. Negative prefix  (-m-4) ──────────────────────────────────────────────
  let negative = false;
  if (remaining.startsWith('-') && remaining.length > 1 && remaining[1] !== '-') {
    negative = true;
    remaining = remaining.slice(1);
  }

  // ── 4. Arbitrary value  <utility>-[<value>] ─────────────────────────────────
  let bracketDepth = 0;
  let bracketStart = -1;
  for (let i = remaining.length - 1; i >= 0; i--) {
    if (remaining[i] === ']') bracketDepth++;
    else if (remaining[i] === '[') {
      bracketDepth--;
      if (bracketDepth === 0) { bracketStart = i; break; }
    }
  }
  if (bracketStart > 0 && remaining[bracketStart - 1] === '-' && remaining.endsWith(']')) {
    const utility = remaining.slice(0, bracketStart - 1);
    const value = remaining.slice(bracketStart + 1, -1).replace(/_/g, ' ');
    return { original: trimmed, modifiers, negative, important, utility, value, isArbitrary: true };
  }
  if (remaining.endsWith(']') && bracketStart === -1) {
    if (process.env.NODE_ENV !== 'production') {
      kbachWarn(`Unbalanced brackets: "${trimmed}"`);
    }
  }
  // Bare [value] — happens when the negative prefix was stripped from -[value],
  // leaving remaining as [value] with no -[ marker. Return gracefully so the
  // resolver can return null instead of the fallback first-dash split producing garbage.
  if (remaining.startsWith('[') && remaining.endsWith(']')) {
    const value = remaining.slice(1, -1).replace(/_/g, ' ');
    return { original: trimmed, modifiers, negative, important, utility: '', value, isArbitrary: true };
  }

  // ── 5. Standalone utility  (no value) ───────────────────────────────────────
  if (getBuiltinStandaloneNames().has(remaining)) {
    return { original: trimmed, modifiers, negative, important, utility: remaining, value: '', isArbitrary: false };
  }

  // ── 6. Greedy prefix match ───────────────────────────────────────────────────
  for (const prefix of getBuiltinUtilityPrefixes()) {
    if (remaining === prefix) {
      return { original: trimmed, modifiers, negative, important, utility: prefix, value: '', isArbitrary: false };
    }
    if (remaining.startsWith(prefix + '-')) {
      const value = remaining.slice(prefix.length + 1);
      return { original: trimmed, modifiers, negative, important, utility: prefix, value, isArbitrary: false };
    }
  }

  // ── 7. Fallback: split on first dash ─────────────────────────────────────────
  const firstDash = remaining.indexOf('-');
  if (firstDash > 0) {
    return {
      original: trimmed,
      modifiers,
      negative,
      important,
      utility: remaining.slice(0, firstDash),
      value: remaining.slice(firstDash + 1),
      isArbitrary: false,
    };
  }

  return { original: trimmed, modifiers, negative, important, utility: remaining, value: '', isArbitrary: false };
}

/**
 * Split a class string into tokens. Whitespace at bracket depth > 0 is STRIPPED
 * (not just skipped) so that arbitrary values like rgb(41, 172, 15) become valid
 * CSS class name tokens: bg-[rgb(41,172,15)].
 */
export function splitClassTokens(classString: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let depth = 0;
  let parenDepth = 0;
  for (let i = 0; i < classString.length; i++) {
    const ch = classString[i];
    if (ch === '[') { depth++; current += ch; continue; }
    if (ch === ']') { depth--; current += ch; continue; }
    if (ch === '(') { parenDepth++; current += ch; continue; }
    if (ch === ')') { parenDepth--; current += ch; continue; }
    if (/\s/.test(ch)) {
      if (depth === 0 && parenDepth === 0) {
        if (current) { tokens.push(current); current = ''; }
      }
      // depth > 0 or parenDepth > 0: strip spaces inside brackets/parens — illegal in HTML class names
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Normalize a full class string so it is safe to use as an HTML className value.
 * Strips spaces inside brackets: "bg-[rgb(41, 172, 15)] p-4" → "bg-[rgb(41,172,15)] p-4"
 */
export function normalizeClassString(classString: string): string {
  return splitClassTokens(classString).join(' ');
}

/** Parse a space-separated class string into individual ParsedClass objects. */
export function parseClasses(classString: string): ParsedClass[] {
  const results: ParsedClass[] = [];
  for (const token of splitClassTokens(classString)) {
    const parsed = parseClass(token);
    if (parsed) results.push(parsed);
  }
  return results;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Find the index of the first `:` that is NOT inside square brackets. */
function findOuterColon(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

// ─── Legacy re-exports from registry (backwards compat) ───────────────────────
// Code that imports registerModifier/clearPluginModifiers from parser.ts continues
// to work; the real implementation now lives in registry.ts.
export { registerModifier, clearPluginModifiers } from './registry';

// getAllModifierNames is also exported for anything that previously relied on the
// internal MODIFIERS set.
export { getAllModifierNames };
