# CLAUDE.md

Project-specific instructions for Claude Code working in this repo.

## Always check AGENTS.md before making changes

This repo's `AGENTS.md` files are the authoritative reference for how
Kbach actually works — check the relevant one(s) **before editing code**,
not just before answering questions about it:

- [AGENTS.md](AGENTS.md) — cross-package overview, `kbach.config.js`
  (shared by both bindings), the color palette, how the Rust engine is
  built.
- [packages/react/AGENTS.md](packages/react/AGENTS.md) — `@kbach/react`
  (web) only.
- [packages/react-native/AGENTS.md](packages/react-native/AGENTS.md) —
  `@kbach/react-native` only.

Before changing behavior in a package, read its own `AGENTS.md` first —
it documents non-obvious design decisions, known footguns, and
version-gated failure modes that aren't visible from the code alone
(e.g. "stale prebuilt `.so`", "duplicate `react-native` instance in a
monorepo"). Skipping this is how a fix ends up re-breaking something the
docs already explain.

After a change that affects install/setup steps, exports, resolution
behavior, modifiers, the `kbach.config.js` shape, or a documented failure
mode, **update the relevant `AGENTS.md` in the same change** — these
files go stale fast otherwise, and a stale reference is worse than no
reference (see the react-native file's own version-gated failure-mode
entries for exactly what that staleness looks like once it happens).
