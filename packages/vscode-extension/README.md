# Kbach IntelliSense (VS Code)

`className` autocomplete, hover previews, and inline typo diagnostics for
[Kbach](https://github.com/semsakadanupol/kbach) — validated against the
real Rust-powered engine, not a hand-maintained copy of its rules.

> Beta. Not yet on the VS Code Marketplace — build and install from a
> local `.vsix` for now (below).

## What it does

- **Hover** a class (`p-4`, `bg-blue-6`, `dark:bg-blue-8`, ...) to see its
  resolved CSS value — a real color swatch for color classes.
- **Inline diagnostics** for an unknown class, right as you type, with a
  one-click "Replace with ..." fix when a real one-character-typo match
  exists — the same validation the dev-server's own "Unknown class ...
  Typo?" warning uses, just surfaced at edit time instead of at runtime.
  On a React Native project specifically, also flags a class that parses
  fine but applies **zero style there** (`group-*`, `peer-*`, `has-[…]`,
  container queries, grid, pseudo-elements).
- **Autocomplete** inside `className="..."`, `kb="..."`, and
  `clsx()`/`cn()`/`kb()` call arguments — modifiers (`dark:`, `hover:`,
  `sm:`, ...), utilities (each with its resolved value shown), and full
  color-shade completion (with a swatch preview) right after typing a
  color prefix like `bg-`/`text-`/`border-`.
- **Color picker** — a native, draggable color wheel for an arbitrary
  value (`bg-[#ff0000]`). A named palette shade (`bg-blue-6`) shows its
  color on hover but is deliberately NOT picker-editable — rewriting a
  curated theme color into a raw literal hex one drag at a time isn't
  something a wheel should make one click away.
- **Reads your own `kbach.config.js`** — a project's custom colors (and
  everything else it extends/replaces) show up correctly everywhere
  above instead of being flagged as unknown, automatically re-applied
  the moment you save that file.

```tsx
<div className="flex items-center bg-blue-500">  {/* ← flagged: Kbach's shades are 1-12, not Tailwind's 50-950 */}
```

## Install (from source, until this is published)

```sh
npm install
npm run build
npm run package
code --install-extension kbach-vscode-<version>.vsix --force
```

Then reload the window (`Ctrl+Shift+P` → "Developer: Reload Window") —
an already-running extension host doesn't pick up a reinstalled version
on its own.

## Known limits

- Hover and diagnostics call the real engine directly, so they're never
  wrong. Autocomplete's general utility list is scraped from the Rust
  engine's own test fixtures rather than a complete enumeration — it can
  miss a real utility, though that never affects whether hover/
  diagnostics gets it right.
- Color-shade completion covers the full palette regardless.
- The typo-correction catches a real typo (`flexx`) but not a wrong-
  convention mistake (Tailwind's `bg-blue-500` instead of Kbach's
  `bg-blue-6`) — a different edit distance entirely.

See [this package's own AGENTS.md](https://github.com/semsakadanupol/kbach/blob/main/packages/vscode-extension/AGENTS.md)
for the full architecture, including a real gotcha worth reading before
touching `src/engine.ts`.

## License

MIT
