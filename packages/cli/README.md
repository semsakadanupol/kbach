# @kbach/cli

Setup automation for [Kbach](https://github.com/semsakadanupol/kbach) —
detects your framework, installs the right package, and wires up the
build-tool config so you don't have to copy-paste it by hand. Also ships
`doctor`, a read-only diagnostic for a project that's already set up.

> Beta. Works with Vite, Next.js, Expo, and React Native CLI.

## Use it without installing

```sh
npx @kbach/cli init
```

Detects which of the four frameworks below your project is, installs
`@kbach/react` or `@kbach/react-native`, and patches the right config
file. Safe to run more than once — re-running on an already-configured
project reports what's already wired up and changes nothing.

```
┌  → [Kbach] init
│
◇  React Native CLI ("react-native" dependency + android/ or ios/ found)
◇  Framework: React Native CLI
│
◆  @kbach/react-native installed
│
◆  Updated babel.config.js
│
◆  This app needs a native rebuild to link the module.
   Run npx react-native run-android now? (Y/n) › Y
│
└  Done. Changed babel.config.js or kbach.config.js later? Restart with:

  npx react-native start --reset-cache
```

## Or install it globally

```sh
npm install -g @kbach/cli
kbach init
kbach doctor
```

## What it wires up per framework

| Framework | Installs | Patches |
| :-- | :-- | :-- |
| Vite | `@kbach/react` | `vite.config.ts` (adds `kbach()`), your entry file (`import './kbach.css'`) |
| Next.js | `@kbach/react` | `postcss.config.js`, the marker pair in `globals.css` |
| Expo | `@kbach/react-native` | `babel.config.js` |
| React Native CLI | `@kbach/react-native` | `babel.config.js`, offers to run the native rebuild |

Every edit is a real codemod (via [`recast`](https://github.com/benjamn/recast)),
not string templating — your existing formatting and comments survive,
and re-running `init` never adds a duplicate entry.

## `doctor` — diagnose an existing setup

Read-only. Checks the package is actually installed, the build-tool
plugin is actually wired, and (Android) the native module is actually in
the *last built* APK — not just declared as a dependency, which is what
actually catches "I updated kbach but forgot to rebuild."

```sh
npx @kbach/cli doctor
```

```
┌  → [Kbach] doctor
│
◆  @kbach/react-native installed (1.0.0-beta.50)
│
◆  babel.config.js has the kbach plugin
│
■  Native module present in the last built APK
│
│     → @kbach/react-native was installed/updated after
│       android/app/build/outputs/apk/debug/app-debug.apk was built —
│       rebuild: npx react-native run-android
│
└  1 issue found.
```

Exits `0` if every check passes, `1` otherwise — usable as a CI gate.

## Flags

```sh
kbach init --dry-run              # show what would change, write nothing
kbach init -y                     # skip every prompt, take the documented defaults
kbach init --pm pnpm              # override package-manager auto-detection
```

Every prompt (dark-mode strategy, the native-rebuild confirmation) also
falls back to its documented default automatically when run from a
non-interactive shell — CI, an agent, anything without a real terminal —
instead of hanging or crashing.

## When a codemod can't apply

If your config file's shape is unusual enough that `init` can't safely
edit it (a `vite.config.ts` that doesn't call `defineConfig(...)`
directly, for example), it says so and prints the exact snippet to paste
in by hand — the same snippet [`@kbach/react`](https://www.npmjs.com/package/@kbach/react)'s
own README shows. It never guesses.

See [this package's own AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/packages/cli/AGENTS.md)
for the full reference — detection logic, every codemod's exact behavior,
the complete `doctor` check list, and failure modes.

## License

MIT
