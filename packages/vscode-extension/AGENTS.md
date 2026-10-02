# `kbach-vscode` — reference for AI assistants

The VS Code extension for [Kbach](https://github.com/semsakadanupol/kbach)
— `className` autocomplete, hover previews (resolved CSS value + a color
swatch), and inline typo diagnostics, all validated against the real
Rust/WASM engine rather than a hand-maintained copy of its rules. This
file covers `kbach-vscode` only; for the cross-package overview, see the
repo root's
[AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

---

## 1. The one gotcha that will break this silently if "simplified"

**Never `require('@kbach/core-engine/node')` directly in runtime code.**
Inside this monorepo that resolves via an npm WORKSPACE SYMLINK straight
to the sibling `packages/core-engine` source directory — fine for running
tests, but once this extension is packaged into a `.vsix` and installed
for real, that symlink target doesn't exist on the end user's machine at
all. Confirmed live, not hypothetical: a real packaged + installed build
produced zero completions, zero hover, zero diagnostics, with no error
surfaced anywhere a user would see it — `getDiagnostics` just showed
nothing had run.

The fix in place (`src/engine.ts`): `npm run build` runs
`scripts/copy-engine.mjs` after `tsup`, which copies
`packages/core-engine/dist-node/kbach_core_engine.js` and its `.wasm`
directly into this package's own `dist/`, next to the bundled
`extension.js`. `engine.ts` requires that vendored copy via a path built
at runtime from `__dirname` (never a string literal, so esbuild/tsup's
bundler can't try to inline the glue file into `extension.js` — that file
does its OWN `__dirname`-relative lookup for the `.wasm` binary, which
bundling into a different location would break), falling back to the
workspace-symlinked package name only when the vendored copy isn't there
yet (the test-against-`src/`-directly case, no build step). `@kbach/core-
engine` is a `devDependency`, not a `dependency` — it is never a real
runtime dependency of the packaged extension.

Packaging (`npm run package`) uses `vsce package --no-dependencies`
deliberately — the real runtime file is the vendored copy in `dist/`,
not anything `node_modules`-resolved, so there's nothing in `node_modules`
worth including at all.

---

## 2. What it provides

| Feature | Source of truth | Provider (`src/extension.ts`) |
| :-- | :-- | :-- |
| Hover (resolved CSS value + color swatch for color values) | The real engine — `generate_css()` via the vendored WASM build (`src/engine.ts`) | `KbachHoverProvider` |
| Inline diagnostics (unknown class, with a typo suggestion when one exists) | Same — an empty `rules` array from `generate_css()` means genuinely unknown | `runDiagnostics()` |
| `className` completion (modifiers + base utilities) | Scraped from `packages/core-engine`'s own Rust test fixtures (§3) | `KbachCompletionProvider` |
| Color-shade completion (`bg-`, `text-`, `border-`, ...) | The full generated palette (`src/generatedPalette.ts`, same generator every other package uses) | `KbachCompletionProvider`, when the text before the cursor ends in a known color prefix |

Hover and diagnostics are never wrong in the sense of disagreeing with
the real engine — they ARE the real engine. Completion is a seed-quality
suggestion list (§3) that can both miss a real utility and, rarely,
suggest something that doesn't actually resolve; the actual engine call
in hover/diagnostics is what catches that, not the completion list.

---

## 3. Where the completion vocabulary comes from (and its real limit)

There is no enumerated "every valid utility" list anywhere, even inside
the Rust engine itself — `resolve_style.rs`'s own typo-correction works
by generating edit-distance-1 candidates and trying to RESOLVE each one,
never by checking against a static set. That's sufficient for validation
(hover/diagnostics, §2) but useless for completion, which needs a
positive list to suggest FROM.

`scripts/generate-vocabulary.mjs` scrapes every `parse_class("...")`
string literal out of `packages/core-engine/src/**/*.rs`'s own
`#[cfg(test)]` modules (751 unique strings as of this writing), splits
each on `:` outside `[...]` brackets into modifier segments + a base
utility, and writes `src/generatedVocabulary.ts`. This is deliberately
the v1 approach, not a proper Rust-side enumeration export (the correct
long-term answer, deferred) — it needs no new Rust code and improves on
its own as tests are added, at the cost of not being exhaustive and
occasionally scraping a deliberately-invalid test fixture (a test named
`resolves_none_for_an_unresolvable_class`-shaped) right alongside the
valid ones. An arbitrary-value modifier with a specific baked-in value
(`@min-[400px]:`, `data-[state=open]:`) is filtered out of the modifier
list specifically — suggesting that literal value back to every user is
actively misleading, unlike a plain reusable one (`dark:`, `hover:`).

`suggestCorrection.ts` runs the identical Norvig-style edit-distance-1
algorithm `resolve_style.rs`'s own `suggest_correction` uses, against
this scraped vocabulary instead of the engine's real dictionary (not
exposed over WASM). It catches a real typo (`flexx` → `flex`); it does
NOT catch a wrong-CONVENTION mistake like Tailwind's `bg-blue-500`
instead of Kbach's `bg-blue-6` — that's a different edit distance
entirely, same limitation the real engine's own corrector has.

Regenerate either generated file after a relevant Rust/palette change:
`npm run generate:vocabulary` / `npm run generate:colors`.

---

## 4. Diagnostics are deliberately narrower than completion's context check

`scanTokens.ts` (diagnostics) only recognizes `className="..."` /
`kb="..."` literal-string attributes and `clsx(/cn(/kb(/classnames(/cx(`
call arguments' QUOTED string literals — no backtick-template-literal
catch-all. `completionContext.ts` (completion) is looser: any open string
whose nearby context looks like one of those same shapes.

This asymmetry is intentional, not an oversight. A missed context in
completion just means no suggestions pop up — harmless. A false positive
in diagnostics is a live, visible squiggly underline on text that was
never a class at all — exactly the real, reported bug
`packages/react/src/vite-plugin/scan.ts`'s own doc comments describe
fixing TWICE in that package's history (`hasUnbracketedParen`,
`isJsxExpressionChildTemplateLiteral` — a JSX heading's own display text,
written as a template literal, got scanned as if it were real classes).
Erring conservative in an editor diagnostic is the opposite trade from a
build-time scanner's, which is why this file doesn't just reuse that
one's rules wholesale.

---

## 5. Build / package / install

```sh
npm run build      # tsup -> dist/extension.js, then vendors the WASM engine (§1)
npm run package     # vsce package --no-dependencies -> a .vsix
code --install-extension kbach-vscode-<version>.vsix --force
```

A window reload (`Developer: Reload Window`) is required after
installing over an existing version — an already-running extension host
doesn't pick up a reinstalled `.vsix` on its own. Confirmed live: checking
diagnostics immediately after `code --install-extension` still showed
nothing until reload.

---

## 6. Common failure modes

- **Nothing works at all after install — no completions, no hover, no
  diagnostics, no visible error** — almost certainly §1's gotcha: the
  vendored WASM files are missing from `dist/` (an `npm run build` that
  only ran `tsup` and skipped `copy-engine.mjs`, or a stale `.vsix`
  packaged before that script existed). Verify `dist/` contains
  `kbach_core_engine.js` + `kbach_core_engine_bg.wasm` alongside
  `extension.js` before packaging.
- **A reinstalled version doesn't seem to change anything** — reload the
  window (§5); the running extension host is still the old one.
- **A real utility doesn't show up in completion** — the scraped
  vocabulary (§3) isn't exhaustive. Doesn't affect correctness of
  hover/diagnostics, which call the real engine regardless.
