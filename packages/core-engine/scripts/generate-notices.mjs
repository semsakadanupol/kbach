#!/usr/bin/env node
// Copies the repo root's THIRD_PARTY_NOTICES.md into a package, so the
// Tailwind CSS MIT notice ships inside every npm package / .vsix that
// contains the engine (an npm package can only include files from its own
// folder). The root file is the single source; verify-generated.mjs fails
// CI if any copy drifts from it.
//
// Usage: node generate-notices.mjs <output-path-relative-to-cwd>
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const outputArg = process.argv[2];
if (!outputArg) {
  console.error('Usage: node generate-notices.mjs <output-path-relative-to-cwd>');
  process.exit(1);
}
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = readFileSync(join(repoRoot, 'THIRD_PARTY_NOTICES.md'), 'utf-8').replace(/\r\n/g, '\n');
const header = '<!-- GENERATED from the repo root THIRD_PARTY_NOTICES.md by packages/core-engine/scripts/generate-notices.mjs. Edit the root file, then regenerate. -->\n\n';
const out = join(process.cwd(), outputArg);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, header + source);
console.log(`Wrote ${out}`);
