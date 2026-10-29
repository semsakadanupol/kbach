# `kbach-vscode` — reference for AI assistants

The VS Code extension for [Kbach](https://github.com/semsakadanupol/kbach)
— `className` autocomplete (with resolved-value docs), hover previews
(resolved CSS value + a color swatch), inline diagnostics (unknown
classes with a one-click quick fix, plus a React-Native-only warning for
classes that parse but apply no style there), and a native color picker
for arbitrary color values — all validated against the real Rust/WASM
engine rather than a hand-maintained copy of its rules, and aware of a
project's own `kbach.config.js` customizations (§6). This file covers
`kbach-vscode` only; for the cross-package overview, see the repo root's
[AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

Published under the `kbach` publisher id (`kbach.kbach-vscode`), not a
personal account — not yet on the Marketplace; installed today via a
locally built `.vsix` (§8).

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
| `className` completion (modifiers + base utilities, each with its resolved value as `.detail`) | Scraped + engine-verified-generated vocabulary (§3) | `KbachCompletionProvider` |
| Color-shade completion (`bg-`, `text-`, `border-`, ...) | The resolved document's own EFFECTIVE theme (§6) — the real palette plus any `kbach.config.js` customization, not just the static default | `KbachCompletionProvider`, when the text before the cursor ends in a known color prefix |
| Inline diagnostics: unknown class, with a typo suggestion when one exists | An empty `rules` array from `generate_css()` means genuinely unknown | `runDiagnostics()` |
| Inline diagnostics: parses fine but applies NO style on React Native (`group-*`, `peer-*`, `has-[…]`, container queries, grid, pseudo-elements) | `nativeUnsupported.ts`, gated to React-Native-flavored workspaces only (§7) | `runDiagnostics()` |
| One-click quick fix for a typo diagnostic | The diagnostic's own carried suggestion (`diagnostic.code`) | `KbachCodeActionProvider` |
| Native color picker wheel — ARBITRARY color values only (`bg-[#fff]`), never a named shade (§5) | `generate_css()` + `parseColorFromText` | `KbachColorProvider` |

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

`scripts/generate-vocabulary.mjs` builds `src/generatedVocabulary.ts`
from TWO sources, merged:

1. **Scraped** — every `parse_class("...")` string literal out of
   `packages/core-engine/src/**/*.rs`'s own `#[cfg(test)]` modules
   (~640 unique strings as of this writing), split on `:` outside
   `[...]` brackets into modifier segments + a base utility. Not
   rigorous: a few resolver test names deliberately exercise INVALID
   input, scraped right alongside the valid ones — an acceptable stray
   bad SUGGESTION (hover/diagnostics still validate for real regardless,
   §2). An arbitrary-value modifier with a specific baked-in value
   (`@min-[400px]:`, `data-[state=open]:`) is filtered out specifically —
   suggesting that literal value back to every user is actively
   misleading, unlike a plain reusable one (`dark:`, `hover:`).
2. **Programmatically generated, engine-verified** — every spacing-scale
   property prefix (`p-`/`m-`/`w-`/`h-`/`inset-`/`gap-`/...) crossed with
   the real numeric/keyword/fraction value set, each candidate checked
   for real against the actual Node-target WASM engine (`generate_css`)
   before being included (~2000 of ~2000 candidates pass as of this
   writing) — unlike the scraped set, a candidate here is either
   engine-verified-valid or silently dropped, never a guess that ships
   unchecked. This is what gets `BASE_UTILITIES` from a few hundred
   scraped fixture tokens up to the real scale (all of `p-0`..`p-96`,
   not just whichever handful a Rust test happened to exercise).

Both are deliberately the v1 approach, not a proper Rust-side
enumeration export (the correct long-term answer, deferred) — no new
Rust code needed, and the scraped half improves on its own as tests are
added.

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

## 5. Color picker: arbitrary values only, named shades are read-only by design

`KbachColorProvider` (`DocumentColorProvider`) only ever offers VS Code's
native editable swatch/wheel for an ARBITRARY bracket color value
(`bg-[#fff]`, `text-[rgba(...)]`) — `isArbitraryColorToken`
(`colorToken.ts`) filters out a NAMED palette shade (`bg-blue-6`)
entirely before it ever becomes a `ColorInformation`.

This is deliberate, not a missing feature: the only possible edit for a
named shade through this widget is to blow it away into a raw literal
hex (`bg-blue-6` → `bg-[#ff0000]`), which destroys the whole point of a
curated, theme-linked palette — a drag on the wheel is exactly the kind
of accidental edit that shouldn't be one click away for those. A named
shade's color is still visible via the HOVER provider's own static
(non-editable) swatch image, just not picker-editable through this one.

`provideColorPresentations` re-scans the LIVE document for the token
starting at the picker's original anchor offset on every call, rather
than trusting VS Code's own `context.range` — necessary, not just
defensive: VS Code reuses that same range across every tick of a drag,
and a length-changing edit (which an arbitrary-to-arbitrary edit usually
isn't, but was confirmed live to matter) silently breaks every edit past
the first tick otherwise.

`COLOR_PREFIXES` (`colorPrefixes.ts`) is `divide-color`, not bare
`divide` — confirmed against the real engine: `divide-x`/`divide-y`/
`divide-solid`/etc. are real `divide-*` utilities with nothing to do with
color; the actual color-bearing one is `divide-color-*`. Every other
entry in that list IS a bare prefix in the real engine.

## 6. `kbach.config.js` awareness

Every resolution path (hover, completion, diagnostics, the color
provider) resolves against a document's EFFECTIVE theme, not just the
built-in default palette — `resolveEffectiveThemeJson` (`extension.ts`)
→ `resolveThemeJsonForDir` (`engine.ts`):

1. `findProjectRoot` (`projectRoot.ts`) walks up from the edited FILE's
   own directory (not the VS Code workspace folder root — usually the
   monorepo root, which has no `kbach.config.js` of its own) looking for
   the nearest ancestor containing a `package.json`. Shared with
   `nativeUnsupported.ts`'s own React-Native-project detection (§7).
2. `loadConfigFile` (`kbachConfigLoader.ts`) is a faithful port of
   `@kbach/react`'s own `loadConfigFile` (same `kbach.config.cjs` →
   `.mjs` → `.js`-with-require/import-fallback precedence) — ported, not
   imported, because that package's compiled entry bundles React-
   dependent code (hooks, `ThemeProvider`) into the same chunk, with no
   standalone subpath export that avoids pulling in a real `react`
   resolution.
3. `resolveKbachConfig` (`kbachConfigResolve.ts`) is the same kind of
   port of that package's own merge algorithm (`extend` merges onto
   `DEFAULT_THEME`, `theme` replaces a section entirely, color aliasing/
   opacity-suffix resolution, grouped `dark` block) — not reinvented.

Both `require()` and `import()` in `kbachConfigLoader.ts` deliberately
defeat Node's own module cache (a cache-busting `?t=` query string for
`import()`, an explicit `delete require.cache[...]` for `require()`) —
unlike the one-shot build tool this was ported from (a fresh process
every run), this extension's host process stays alive for the whole
editor session, so a stale cached copy of a since-edited config file
would otherwise serve its OLD contents forever.

Resolved per project root and cached (`engine.ts`'s `themeJsonCache`) —
real disk I/O and a `require()`/`import()` of a whole file, not
something to redo on every keystroke. Invalidated automatically when
that root's `kbach.config.(js|cjs|mjs)` is SAVED (`extension.ts`'s
`onDidSaveTextDocument` hook), which also clears the completion/color
parsing caches and re-runs diagnostics on every open document — editing
the config and saving it updates the editor live, no reload needed. A
genuine load failure (most likely a syntax error) shows ONE warning
notification per root per session (not re-spammed every keystroke) and
falls back to the default theme for that root until the file is saved
again.

## 7. Native-unsupported-on-RN diagnostic

A SEPARATE diagnostic kind (`diagnostic.code = 'native-unsupported'`,
never offered as a quick-fix target — `KbachCodeActionProvider`
explicitly skips that sentinel) for a token that resolves FINE but uses
a modifier/utility that parses without error and applies ZERO style on
React Native: `group-*`, `peer-*`, `has-[…]`, container queries
(`@...`), CSS grid, and pseudo-elements (`before:`/`after:`/etc.) — the
single most dangerous silent-failure class root AGENTS.md's own "read
this first" callout names.

Only ever checked when `isReactNativeWorkspace(document)` is true
(`nativeUnsupported.ts`'s `isReactNativeProject`, walking up from the
FILE's own directory via `findProjectRoot`, §6 — NOT the VS Code
workspace folder root, for the identical monorepo reason) — these all
work completely normally on web, so a web file never gets this warning
regardless of what's in the workspace elsewhere.

## 8. Build / package / install

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

## 9. Common failure modes

- **Nothing works at all after install — no completions, no hover, no
  diagnostics, no visible error** — almost certainly §1's gotcha: the
  vendored WASM files are missing from `dist/` (an `npm run build` that
  only ran `tsup` and skipped `copy-engine.mjs`, or a stale `.vsix`
  packaged before that script existed). Verify `dist/` contains
  `kbach_core_engine.js` + `kbach_core_engine_bg.wasm` alongside
  `extension.js` before packaging.
- **A reinstalled version doesn't seem to change anything** — reload the
  window (§8); the running extension host is still the old one.
- **A real utility doesn't show up in completion** — the scraped +
  generated vocabulary (§3) isn't exhaustive. Doesn't affect correctness
  of hover/diagnostics, which call the real engine regardless.
- **`kbach.config.js` custom colors/values aren't recognized — still
  "Unknown Kbach class" on a class that's genuinely defined there** —
  before assuming a bug, check: (1) is `kbach.config.js` in the SAME
  directory as the nearest `package.json` ABOVE the file you're editing
  (§6's walk-up — a config at a monorepo root with the edited file in a
  DIFFERENT nested package won't be found); (2) did a VS Code warning
  notification appear when the file was first touched (a genuine
  load/syntax error in the config — check its exact message); (3) did
  you SAVE the config after editing it (an in-progress, unsaved edit in
  another tab isn't picked up, same as any file-based resolution). If
  none of those explain it, verify the merge logic itself end-to-end for
  that exact config shape against `kbachConfigResolve.ts` before
  assuming the extension is broken — the whole pipeline (discovery,
  loading, merging, caching) has its own test coverage per file, but a
  real-world config can combine shapes in ways a unit test didn't
  anticipate.
- **The color picker wheel doesn't open for a named shade (`bg-blue-6`)
  but does for an arbitrary value** — not a bug, §5's own deliberate
  design: named shades are picker-read-only on purpose.
