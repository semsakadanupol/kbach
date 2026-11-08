// Node-only — the browser's wasmLoader.ts (async, fetch-based `--target web`
// build) is wrong for build-time tooling running in Node. `--target nodejs`
// is a separate wasm-pack output built specifically for this: CommonJS,
// synchronous instantiation via fs.readFileSync, no init()/await needed at
// all — simpler than the browser loader, not just a Node port of it.
import { generate_css, suggest_class } from '@kbach/core-engine/node';

export interface RuleEntry {
  rule: string;
  order: number;
}

interface GenerateCssResult {
  className: string;
  rules: RuleEntry[];
}

/** Resolves a single class token (or any space-separated class string) synchronously — no init step required. */
export function generateCssForToken(token: string, themeJson: string): GenerateCssResult {
  return JSON.parse(generate_css(token, themeJson)) as GenerateCssResult;
}

/**
 * The engine's "did you mean" for an unknown class: a Tailwind CSS shade
 * mapped to Kbach's (`bg-blue-500` -> `bg-blue-6`), else a one-edit typo
 * fix. `null` when there's none. See core-engine's suggest.rs.
 */
export function suggestClassForToken(token: string, themeJson: string): string | null {
  return suggest_class(token, themeJson) || null;
}
