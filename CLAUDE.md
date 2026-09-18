# CLAUDE.md

Project-specific instructions for Claude Code working in this repo.

## Always verify AGENTS.md is still up to date

This repo's `AGENTS.md` files are the authoritative reference for how
Kbach actually works:

- [AGENTS.md](AGENTS.md) — cross-package overview, `kbach.config.js`
  (shared by both bindings), the color palette, how the Rust engine is
  built.
- [packages/react/AGENTS.md](packages/react/AGENTS.md) — `@kbach/react`
  (web) only.
- [packages/react-native/AGENTS.md](packages/react-native/AGENTS.md) —
  `@kbach/react-native` only.

The user changes and adds features directly, not only through a session
with an AI assistant — so `AGENTS.md` can drift out of date from work this
session never saw, not just from a change made just now. Don't assume it's
current just because nothing in THIS conversation touched it yet.

**Before working on a package, check whether its `AGENTS.md` still
matches the current code** for whatever area the task touches — install/
setup steps, exports, resolution behavior, modifiers, the
`kbach.config.js` shape, version numbers named in failure-mode entries,
etc. If the code has moved on and the doc hasn't, treat that as something
to fix, not just note — update the doc as part of the task, the same way
a stale test or a broken build would get fixed, even if nobody explicitly
asked "update the docs." A stale `AGENTS.md` is worse than no `AGENTS.md`
at all, since it actively misleads whoever reads it next.

After making a change yourself that affects any of the above, update the
relevant `AGENTS.md` in the same change, for the same reason.
