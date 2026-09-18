# `@kbach/cli` — reference for AI assistants

The setup-automation CLI for [Kbach](https://github.com/semsakadanupol/kbach)
— `npx @kbach/cli init` wires up `@kbach/react` or `@kbach/react-native` in
an existing project (framework detection, config-file codemods, install),
and `npx @kbach/cli doctor` runs read-only diagnostics against an already-
set-up project, with a real exit code for CI. This file covers
`@kbach/cli` only; for the cross-package overview, `kbach.config.js`
reference, the color palette, and how the underlying engine is built, see
the repo root's
[AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/AGENTS.md).

---

## 1. `init` vs `doctor`

- **`init`** — one-time wiring for a project that hasn't been set up yet
  (or was only partially set up). Installs the right package, patches the
  right config file(s), asks the one theming question that has no safe
  default (dark-mode strategy). Idempotent — see §4.
- **`doctor`** — never edits anything. Diagnoses a project that's
  supposedly already set up: is the package actually installed, is the
  build-tool plugin actually wired, is the native module actually in the
  last build, does `kbach.config.js` actually parse. Exit code 0/1 (§7),
  so it doubles as a CI gate.

Both commands share the same detection step (§2).

---

## 2. Detection logic

`detectCandidates()` (`src/detect.ts`) reads the project's own
`package.json` (`dependencies` + `devDependencies` merged) and returns
**every** matching framework, not just the first — this is deliberate: the
priority order below is a tie-break for the interactive prompt, never a
silent "first match wins" rule, since a monorepo root with more than one
real signal present must never be guessed at.

| Check | Framework | Extra confirmation (shown in the "Detecting…" line, not required to match) |
| :-- | :-- | :-- |
| `expo` in deps | Expo | `app.json` / `app.config.js` / `app.config.ts` present |
| `react-native` in deps, no `expo` | React Native CLI | `android/` or `ios/` dir present |
| `vite` + `react` in deps, no `react-native`, AND a `vite.config.{ts,js,mts,mjs}` exists | Vite | — (the config file itself is required, not just optional confirmation) |
| `next` in deps | Next.js | — |

`FRAMEWORK_PACKAGE` (same file) maps each framework to the package `init`
installs: `@kbach/react` for Vite/Next.js, `@kbach/react-native` for
Expo/React Native CLI.

**Ambiguous or empty detection** (`pickFramework()`,
`src/init/index.ts`) — `init` warns, then:
- Interactive terminal: `@clack/prompts`' `select()` asks which framework
  it actually is.
- Non-interactive (§5): hard error, exit 1. Unlike the dark-mode prompt,
  there's no safe default to fall back to here — guessing wrong would
  silently patch the wrong config file.

`doctor` (`src/doctor/index.ts`) is simpler by design: it just takes
`candidates[0]` and runs that framework's checks, without prompting on
ambiguity — a read-only diagnosis picking "whichever detected framework's
checks happen to run first" carries none of `init`'s file-mutation risk.

---

## 3. `init` per framework

| Framework | Installs | Patches | Prints as next step |
| :-- | :-- | :-- | :-- |
| Vite | `@kbach/react@beta` | `vite.config.{ts,js,mts,mjs}` (adds `kbach()`); entry file (`import './kbach.css'`) | — |
| Expo | `@kbach/react-native@beta` | `babel.config.js` (function-export form) | `npx expo start --clear` |
| React Native CLI | `@kbach/react-native@beta` | `babel.config.js` (object-export form) | `npx react-native start --reset-cache` |
| Next.js | `@kbach/react@beta` | `postcss.config.{js,mjs,cjs}`; `globals.css` marker pair | — |

Every flow ends with the shared dark-mode-strategy step (§5 of the root
AGENTS.md's config reference) via `resolveDarkModeStrategy()` +
`writeKbachConfigIfNeeded()` (`src/configFile.ts`) — `kbach.config.js` is
only ever created if a non-default strategy is chosen, and only if the
file doesn't already exist.

### Vite (`src/init/vite.ts`)

`patchViteConfig()` (`src/codemods/viteConfig.ts`) only handles `export
default defineConfig({ plugins: [...] })` with a literal object argument
— the exact shape `packages/react/AGENTS.md` §1 documents. It adds the
`import { kbach } from '@kbach/react/vite';` import (respecting an
existing import under a different local alias) and inserts `kbach()`
immediately before a `react()` call in the `plugins` array, or at the
front if no `react()` call is found. Anything else (a callback form, a
config built from a variable) is reported unpatchable rather than
guessed at.

`findEntryFile()` (`src/codemods/entryImport.ts`) looks for
`src/main.{tsx,ts,jsx,js}` or `app/root.{tsx,ts}` (React Router framework
mode), then inserts `import './kbach.css';` right after the last existing
import — unless a `kbach.css`-named import already exists anywhere in the
file, at any relative path.

### Expo (`src/init/expo.ts`)

If `babel.config.js` doesn't exist yet, creates it from the documented
function-export template (`packages/react-native/AGENTS.md` §1) with the
plugin already included. If it does exist, patches it (see §6's codemod
notes — shared with React Native CLI).

**Self-heals a real, confirmed npm-hoisting gap**: after creating a new
`babel.config.js`, `babelPresetExpoResolves()` checks (via
`createRequire(...).resolve('babel-preset-expo')`) whether that preset is
actually reachable from the project root. On a real, fresh
`create-expo-app` (SDK 57) install, it wasn't — npm left it nested under
`node_modules/expo/node_modules/` rather than hoisted, not because of a
version conflict (confirmed only one version existed anywhere in the
tree), just how that particular install happened to shake out. A plain
`npx expo export` reproduces the resulting build failure independent of
this CLI, since it's the exact documented snippet failing, not a codemod
bug. When this happens, `init` installs `babel-preset-expo` directly as a
devDependency via `installDevPackage()` (`src/pm.ts`) so the newly
created config actually works.

### React Native CLI (`src/init/reactNativeCli.ts`)

Same babel-patch-or-create step, using the object-export template
instead (`presets: ['module:@react-native/babel-preset']`). After the
config step, asks (via `confirmOrDefault()`, §5) "This app needs a native
rebuild to link the module. Run `npx react-native run-android` now?" —
default **decline**; if confirmed, runs it directly via `runCommand()`
(`src/runCommand.ts`, `stdio: 'inherit'` so Gradle/Metro output streams
live). `npx react-native start --reset-cache` is always printed as the
next-time reminder, whether or not the rebuild ran now.

### Next.js (`src/init/next.ts`)

`patchPostcssConfig()` (`src/codemods/postcssConfig.ts`) handles three
export shapes: `module.exports = {...}`, `export default {...}`, and —
confirmed as the actual current `create-next-app` default output, not a
hypothetical — `const config = {...}; export default config;`. Adds
`'@kbach/react/postcss': {}` to whichever shape `plugins` already uses
(an object, per the docs, or an array — some hand-written/Tailwind-CLI-
style configs use that instead).

`findGlobalsCssFile()` (`src/findGlobalsCss.ts`) checks, in order:
`app/globals.css`, `src/app/globals.css`, `styles/globals.css`,
`src/styles/globals.css` — the last one covers a real Pages Router layout
(global styles kept under `src/` but separate from `src/pages/`) that was
missing from the first three paths until this was reported live.
`ensureKbachCssMarkers()` (`src/codemods/globalsCssMarkers.ts`) appends
the `/* kbach:start */` / `/* kbach:end */` pair at the end of the file
if neither marker is present; if both already are, it's a no-op — never
touches whatever's already between them, this run or any later one.

---

## 4. Idempotency

Every codemod checks whether it's already applied *before* writing
anything. Re-running `init` on an already-configured project reports
"already wired up" / "already has the kbach plugin" / "already imports
kbach.css" / "already has the kbach marker pair" per file, and writes
nothing — never a duplicate `kbach()` entry, a second `@kbach/react-
native/babel-plugin` string, or a second marker pair. This is a real,
load-bearing property, not an incidental side effect: it's what makes
`init` safe to re-run any time, including after a partial or interrupted
setup, rather than something to run exactly once and never again.

---

## 5. Non-interactive behavior & flags

Every interactive prompt goes through a wrapper that checks
`isInteractive()` (`src/isInteractive.ts`: `process.stdin.isTTY &&
process.stdout.isTTY`) before ever calling `@clack/prompts`' `select()` /
`confirm()` — calling either directly on a non-TTY stdin throws a raw,
uncaught `SystemError [ERR_TTY_INIT_FAILED]`, confirmed live (any CI
runner, any agent shell, `node ... </dev/null`). Instead:

- **Dark-mode strategy** (`resolveDarkModeStrategy()`,
  `src/configFile.ts`) — non-interactive: prints a warning and takes the
  system-default fallback (no config file). `-y`/`--yes`: same fallback,
  silently.
- **Native-rebuild confirm** (`confirmOrDefault()`,
  `src/confirmPrompt.ts`) — same pattern, default is decline (print the
  command instead of running it) either way.

This is what makes `init`/`doctor` safe to run from CI or an agent shell,
not just an interactive terminal — a hard requirement, not a nice-to-
have, since `doctor` is explicitly CI-gateable (§7) and a `init` that can
crash in the same class of environment would be an inconsistency.

Flags (`src/cli.ts`):

```
kbach <init|doctor> [--dry-run] [-y|--yes] [--pm <npm|pnpm|yarn|bun>]
```

- `--dry-run` — every codemod still runs and reports what it *would* do;
  `writeFileAtomic()` calls are skipped, so nothing on disk changes.
- `-y` / `--yes` — every prompt takes its documented default, same as the
  non-interactive fallback but without the warning.
- `--pm` — overrides `detectPackageManager()` (`src/pm.ts`), which
  otherwise picks npm/pnpm/yarn/bun from whichever lockfile is present at
  the project root.

---

## 6. Codemod approach

Every config-file edit is a codemod via `recast` (parser:
`recast/parsers/babel-ts`, i.e. `@babel/parser` with TS+JSX enabled), not
string templating — existing formatting and comments outside the nodes
actually touched are preserved, so a re-run is a true no-op (§4) and a
hand-edited file comes back out looking hand-edited, not regenerated.

Each codemod (`viteConfig.ts`, `babelConfig.ts`, `postcssConfig.ts`)
returns `{ ok: false, reason }` rather than guessing when it can't
confidently locate an insertion point — an unrecognized `vite.config.ts`
export shape, a `babel.config.js` that isn't a plain object or a
function/arrow returning one, a `postcss.config.js` wrapped in a function
call. The caller then prints the exact manual snippet from the relevant
package's own README/AGENTS.md instead of writing anything.

Every actual write goes through `writeFileAtomic()` (`src/fsAtomic.ts`)
— temp file + rename — so a crash mid-write can't leave a config file
half-written.

`globalsCssMarkers.ts`'s marker-insertion and `entryImport.ts`'s import-
insertion are plain line/string-based, not AST-based — inserting one
standalone line carries none of the "which array/property" ambiguity the
`vite.config.ts`/`babel.config.js`/`postcss.config.js` codemods have to
resolve.

---

## 7. `doctor` checks

| Check | Frameworks | What it verifies |
| :-- | :-- | :-- |
| `checkPackageInstalled()` | all | The right package is actually on disk — walks `node_modules` up through parent directories the way Node's own resolver does, so a workspace-hoisted install (the dependency living in a parent directory's `node_modules`, not the project's own) is found correctly, not false-failed. |
| `checkViteConfigWiring()` | Vite | `kbach()` is in the `vite.config.ts` plugins array (read-only reuse of `patchViteConfig()`'s own detection). |
| `checkKbachCssGenerated()` | Vite | `kbach.css` exists, is non-empty, and is imported from the entry file. |
| `checkBabelPluginWiring()` | Expo, RN CLI | `@kbach/react-native/babel-plugin` is in `babel.config.js`'s plugins. |
| `checkNativeModuleInApk()` | RN CLI only | Opens the most recently modified of `android/app/build/outputs/apk/{debug,release}/*.apk` as a zip (`src/zipEntries.ts` — a from-scratch central-directory parser, no zip dependency needed since only entry NAMES are ever checked, never decompressed) and looks for `lib/<abi>/libkbach_core_engine.so`. Also cross-checks the APK's own mtime against `node_modules/@kbach/react-native/package.json`'s — catches "installed/updated kbach after your last native build" even when a *stale* `.so` from the previous build is technically still present, which `checkPackageInstalled()` alone can't tell apart from a fresh one. |
| `checkDuplicateInstances()` | Expo, RN CLI | Walks `node_modules` for a second, nested copy of `react-native`/`react` under some other package's own `node_modules` — the exact shape `packages/react-native/AGENTS.md` §11 documents (Metro ending up with two physical module instances). A plain non-monorepo install never triggers this. |
| `checkPostcssConfigWiring()` | Next.js | `'@kbach/react/postcss'` is in `postcss.config.js`'s plugins (read-only reuse of `patchPostcssConfig()`). |
| `checkGlobalsCssMarkers()` | Next.js | The marker pair exists in whichever `globals.css` path `findGlobalsCssFile()` finds (§3). |
| `checkConfigSyntax()` | all | `kbach.config.js` parses via `@babel/parser` — never `require()`s it, so a syntax error can't execute arbitrary code either. On failure, hints at the unquoted-hyphenated-key trap (root AGENTS.md §5) when the source contains a hyphen. `null` (not a failure) if there's no `kbach.config.js` at all — a valid, common state. |

Exit code: **0** if every check passes, **1** if any fails
(`runDoctor()`'s return value, propagated to `process.exitCode` in
`cli.ts`) — usable as a CI gate, not just an interactive tool.

---

## 8. Package name / bin

Published as **`@kbach/cli`** (the bare name `kbach` is blocked by npm's
anti-typosquat filter — too similar to an existing unrelated package,
`batch`). The `bin` field maps the command name `kbach` to `dist/cli.js`
regardless of the package's own scoped name, so:

```sh
npx @kbach/cli init      # or doctor
npm i -g @kbach/cli && kbach init   # bare `kbach` command after a global install
```

---

## 9. Common failure modes

- **"No app/globals.css, src/app/globals.css, styles/globals.css, or
  src/styles/globals.css found"** — your global stylesheet is at a path
  outside all four conventions this checks. Add the marker pair to it
  yourself (`packages/react/AGENTS.md` §1's snippet), then import it once
  from your entry point.
- **`doctor`'s native-module-in-APK check fails** — always means
  *rebuild*, never *reinstall*. `checkPackageInstalled()` runs first and
  would already have failed if the package itself were missing; a
  present-but-failing APK check means the JS side is fine and Android
  just hasn't picked up the change yet: `npx react-native run-android`.
- **A codemod reports "couldn't safely patch" and prints a manual
  snippet** — the config file's export shape isn't one of the ones §3
  lists for that framework. This is the CLI's own documented failure
  mode, not a bug: paste the printed snippet in by hand.
- **`init` exits 1 immediately after "Detecting…" with no framework
  chosen** — either the terminal wasn't interactive and detection was
  ambiguous or empty (§2, §5), or you cancelled the interactive select.
