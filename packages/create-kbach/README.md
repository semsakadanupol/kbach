# create-kbach

Adds [Kbach](https://www.npmjs.com/package/@kbach/ui) to an **existing** React (Vite/Next.js) or React Native (Expo) project. It doesn't scaffold a new app — run it from inside a project you already have.

```
npm create kbach@latest
```

(or `npx create-kbach`)

## What it does

Detects your package manager (from the lockfile) and platform (Vite/Next.js/Expo, from `package.json` and known config files), then:

- Installs `@kbach/ui` — the one package for web, React Native, and Expo
- Creates `kbach.config.js` (skipped if one already exists)
- Merges `compilerOptions.jsx`/`jsxImportSource` into `tsconfig.json` (or `tsconfig.app.json`, whichever your project actually uses) — skipped if already set, or if it conflicts with something already there
- Static CSS setup (Vite web only): creates `src/kbach.css` with the marker comments
- Native: creates `babel.config.js` with the Kbach preset — only if you don't already have one

It deliberately does **not** edit `vite.config.ts`, your app's root component, or an existing `babel.config.js` — those are arbitrary source files, and blindly patching them risks producing broken code. Instead it prints the exact snippet to paste, copy-paste identical to what [`@kbach/ui`'s README](../react/README.md) documents (including the React Native/Expo section).

## Flags

```
--platform=web|next|native   Skip platform detection/prompt
--setup=runtime|static       Skip the Runtime-vs-Static-CSS prompt (web only)
--pm=npm|pnpm|yarn|bun       Override detected package manager
--yes, -y                    Accept defaults, skip all prompts
--no-install                 Don't run the package install
```

## Full setup reference

[`@kbach/ui` README](../react/README.md)
