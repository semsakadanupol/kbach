# Rules for working in this repo

Standing engineering rules for this codebase, distilled from the refactor that fixed 7 confirmed bugs traced to three root causes: monolith files, duplicated logic, and `globalThis`-singleton state hacks. Apply these to *all* new work here, not just as a one-time cleanup — they're why those bug classes stopped recurring.

## 1. No monolith files
Split by domain once a file is doing too many unrelated things. `core/utilities.ts` used to be one 2000-line file holding every resolver; it's now a thin barrel over `core/resolvers/*.ts`, one file per domain (spacing, color, border, layout, typography, filters, transform, effects, misc). New resolver logic goes in the matching domain module — don't grow the barrel back into a monolith.

## 2. Kill duplication at the root, not per-instance
When the same logic gets hand-rolled in two places, extract one shared, tested helper instead of copy-pasting. Duplicated logic is exactly how the same bug independently reappears in both places — the Vite plugin and Babel plugin each had an independently-broken silent catch until their cache/config-loading logic was unified.

## 3. No `globalThis`-singleton or cross-bundle state hacks if a real fix exists
Prefer actually sharing one module instance over workarounds. `core` is built as its own externalized entry specifically so `dist/index.js` and `dist/jsx-runtime.js` share real module state instead of each bundling a private copy. If a hack is genuinely unavoidable (e.g. an esbuild/CJS code-splitting limitation), document *why* inline so a future pass doesn't "fix" it back into a bug.

## 4. Never break the public API silently
Preserve exact public exports and runtime behavior unless a change is the explicit goal. Type-level tightening (e.g. narrowing `useColors<T>()`'s generic) is fine since it's additive/optional — call out anything that changes shape or runtime behavior explicitly, don't bury it in an unrelated diff.

## 5. Tier 1 / Tier 2 automation discipline
When building tooling that writes to a user's project (see `create-kbach`): only auto-write brand-new files or merge structured data (JSON/JSONC). Never regex/text-surgery an arbitrary existing source file (`vite.config.ts`, `App.tsx`, an existing `babel.config.js`) — print the exact snippet to paste instead. Silent, subtly-broken automation is worse than no automation.

## 6. Docs/content: one source of truth, don't fork copies
Render from the existing `.md` files rather than re-authoring content elsewhere (the docs site pulls `packages/*/README.md` and `*.md` reference docs in via Vite `?raw` imports). Copy-pasted content drifting out of sync was a repeated, confirmed bug class in this repo.

## 7. Verify across real bundlers/runtimes, not just Node
A Node-level `require()`/`import()` smoke test is not sufficient proof a package works through a real bundler. Dogfood the actual consumption path when practical — building the docs site with `vite build` surfaced a real `package.json` `exports`-map bug (CJS/ESM interop) that pure Node testing missed. For `exports` maps: point `"import"` at genuine ESM output (`.mjs` using `export {}` syntax), not the same file as `"require"` — bundlers' static CJS-named-export detection is not fully reliable on bundler-emitted CJS.

## 8. No half-finished or speculative work
Don't build abstractions for domains not yet needed. `useSpacing`/`useColors` shipped because they're the two theme domains actually needed as raw JS values often enough to justify a dedicated hook; other domains stay as `useTheme().config.theme.X` rather than getting speculative hooks nobody asked for.

---

Background and full rationale for each rule: `C:\Users\KingCM\.claude\plans\shiny-watching-parasol.md` (the refactor roadmap this file was distilled from).
