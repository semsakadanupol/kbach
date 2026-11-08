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

Published on the VS Code Marketplace as `kbach.kbach-vscode` under the
`kbach` publisher id, not a personal account, flagged Preview. First
published 2026-11-08 as `0.1.0` by uploading the `.vsix` on the
Marketplace's web page (§8). Install with `code --install-extension
kbach.kbach-vscode`. The user-facing docs (readme.md, the docs site)
show only the Marketplace install; building from source is in §8 here.
`0.1.0`'s listing shipped a README with its "Known limits" heading cut
off by a bad edit; `0.1.1` restores it.

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
and an arbitrary-to-arbitrary edit can still change the token's length
(`#fff` -> `#ff0000`, or an alpha < 1 switching to `rgba(...)`), which
silently breaks every edit past the first tick otherwise (confirmed
live).

`splitRespectingBrackets` (modifier/base splitting) lives once, in
`scanTokens.ts`, shared by `colorToken.ts` and `nativeUnsupported.ts`;
`scripts/generate-vocabulary.mjs` keeps a plain-JS copy only because it
runs before any TS build — keep the two in sync.

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

`require()` reloads also evict every project-local file the config
`require()`d on its previous load (`./tokens.js`, `./colors.json` —
tracked per root as `configDependencies` in `kbachConfigLoader.ts`), not
just the config's own cache entry. **Known limit:** an ESM config's
`import`ed children can't be tracked or evicted (Node's ESM loader has no
cache eviction, and the `?t=` bust only applies to the top-level file) —
after editing a helper that an `.mjs`/ESM config imports, reload the
window. `ERR_REQUIRE_ASYNC_MODULE` (Node 22.12+'s `require(esm)` hitting
top-level `await`) also counts as "fall back to `import()`" — a
deliberate divergence from `@kbach/react`'s original, which only checks
`ERR_REQUIRE_ESM`.

**Default theme is per binding** (`engine.ts`'s `baseThemeForRoot`): a
root whose `package.json` depends on `@kbach/react` (and NOT
`@kbach/react-native`, since Expo Web runs on the native defaults) merges
over `WEB_DEFAULT_THEME`, which adds the `surface` color `@kbach/react`'s
own `defaultTheme` ships; everything else uses `DEFAULT_THEME` (the
native binding's set). `defaultTheme.test.ts` reads
`packages/react/src/theme.ts` directly and fails if the two drift.

Resolved per project root and cached (`engine.ts`'s `themeJsonCache`) —
real disk I/O and a `require()`/`import()` of a whole file, not
something to redo on every keystroke. The cache holds the in-flight
PROMISE, so simultaneous first requests (diagnostics + color provider +
hover on file open) share one load, and an invalidation that lands while
a load is pending can't be overwritten by that load's stale result.

Invalidated automatically by `extension.ts`'s `handleFileChanged`, fed
by BOTH a workspace `FileSystemWatcher` (`**/*.{js,cjs,mjs,json}` —
catches `git checkout`/`pull`, deletes, edits from other tools) and
`onDidSaveTextDocument` (for files outside every workspace folder, which
get no watcher events). It invalidates a root when its `kbach.config.*`
is created/changed/deleted, when its `package.json` changes (binding
default, above — this also clears the whole React-Native-project cache,
§7), or when any file its last CommonJS config load `require()`d
changes. Then it clears the completion/color parsing caches and re-runs
diagnostics on every open document — each document has its OWN 300 ms
debounce timer, so all of them really are re-run (a single shared timer
used to cancel every document's run but the last). A run whose document
was closed or edited again while it awaited the theme drops its result
instead of setting stale diagnostics.

A genuine load failure (most likely a syntax error) shows ONE warning
notification per root (not re-spammed every keystroke), and that root
serves its default theme until one of the inputs above changes again.

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
npm run package     # copies ../../LICENSE in, then vsce package --no-dependencies -> a .vsix
code --install-extension kbach-vscode-<version>.vsix --force
npm run publish:marketplace   # same, but vsce publish (needs `npx @vscode/vsce login kbach` first)
```

**Releasing a new version.** Bump `version` in package.json (the
Marketplace refuses a version it already has), then either:
- **Web upload, no token** (how 0.1.0 shipped): `npm run package`, then
  at https://marketplace.visualstudio.com/manage/publishers/kbach open the
  extension's **…** menu → **Update** and upload the new `.vsix`.
- **CLI:** `npm run publish:marketplace`. That needs an Azure DevOps
  Personal Access Token with the **Marketplace → Manage** scope and
  **All accessible organizations** (one organization gives a 401),
  stored once with `npx @vscode/vsce login kbach`.

A new listing's page at `marketplace.visualstudio.com/items?itemName=…`
can 404 for a while after the first upload, during the Marketplace's
scan, even though the gallery API already returns it. Check the API
(`POST /_apis/public/gallery/extensionquery`, filterType 7 with the
extension id) before assuming the upload failed.

Marketplace rules this package follows:
- **`version` must be plain `major.minor.patch`.** The Marketplace rejects
  a prerelease suffix (`0.1.0-beta.1` was this package's version until
  2026-11-08). The beta status is the `"preview": true` flag (a "Preview"
  badge on the listing) instead. For a real pre-release channel, publish
  with `vsce publish --pre-release` on a separate minor line.
- **`icon`** is `images/icon.png`, 256×256 PNG of the Kbach logo (SVG is
  not allowed); `galleryBanner.color` `#2e393f` is the logo's slate.
- **LICENSE**: vsce wants a license file in the extension folder and stops
  to ask without one. The `package`/`publish:marketplace` scripts copy the
  root `LICENSE` in first; the copy is gitignored.
- **`.vscodeignore`** keeps `src/`, tests and this `AGENTS.md` out of the
  `.vsix`. Check the file list `vsce package` prints before publishing.
- The script is `publish:marketplace`, not `publish`: npm runs a script
  named `publish` as a lifecycle hook of `npm publish`.
- `readme.md` is the listing page, so keep its install section true.

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
  another tab isn't picked up, same as any file-based resolution);
  (4) is the change in a helper that an ESM config `import`s (§6's known
  limit — reload the window). If
  none of those explain it, verify the merge logic itself end-to-end for
  that exact config shape against `kbachConfigResolve.ts` before
  assuming the extension is broken — the whole pipeline (discovery,
  loading, merging, caching) has its own test coverage per file, but a
  real-world config can combine shapes in ways a unit test didn't
  anticipate.
- **The color picker wheel doesn't open for a named shade (`bg-blue-6`)
  but does for an arbitrary value** — not a bug, §5's own deliberate
  design: named shades are picker-read-only on purpose.
