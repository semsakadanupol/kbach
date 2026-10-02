import { BASE_UTILITIES } from './generatedVocabulary';

/**
 * Same Norvig-style edit-distance-1 approach `resolve_style.rs`'s own
 * `suggest_correction` uses on the Rust side (delete / transpose /
 * replace / insert over a fixed alphabet, checking which single-edit
 * variant lands in the dictionary) — just run against this package's
 * scraped vocabulary (`generatedVocabulary.ts`) instead of the engine's
 * real `resolve_utility` dictionary, since that's not exposed over WASM.
 * Catches a real typo (`flexx`, `p-r4`); does NOT catch a wrong-
 * CONVENTION mistake like Tailwind's `bg-blue-500` instead of Kbach's
 * `bg-blue-6` — that's a different edit distance entirely, same
 * limitation the real engine's own corrector has.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789-_[]().,%/#:';

const KNOWN = new Set(BASE_UTILITIES);

function editDistance1Candidates(word: string): Set<string> {
  const candidates = new Set<string>();
  // Delete
  for (let i = 0; i < word.length; i++) {
    candidates.add(word.slice(0, i) + word.slice(i + 1));
  }
  // Transpose adjacent
  for (let i = 0; i < word.length - 1; i++) {
    candidates.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  // Replace
  for (let i = 0; i < word.length; i++) {
    for (const ch of ALPHABET) {
      candidates.add(word.slice(0, i) + ch + word.slice(i + 1));
    }
  }
  // Insert
  for (let i = 0; i <= word.length; i++) {
    for (const ch of ALPHABET) {
      candidates.add(word.slice(0, i) + ch + word.slice(i));
    }
  }
  return candidates;
}

/** Returns a single best-guess correction for `token` found in the known vocabulary, or null. */
export function suggestCorrection(token: string): string | null {
  if (KNOWN.has(token)) return null; // Not actually unknown.
  for (const candidate of editDistance1Candidates(token)) {
    if (KNOWN.has(candidate)) return candidate;
  }
  return null;
}
