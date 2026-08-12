// Node-only — the browser's wasmLoader.ts (async, fetch-based `--target web`
// build) is wrong for build-time tooling running in Node. `--target nodejs`
// is a separate wasm-pack output built specifically for this: CommonJS,
// synchronous instantiation via fs.readFileSync, no init()/await needed at
// all — simpler than the browser loader, not just a Node port of it.
import { generate_css } from '@kbach/core-engine/node';

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
