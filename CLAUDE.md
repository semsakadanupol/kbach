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

## Always test a new or fixed feature before calling it done

Don't report a fix or a new feature as finished on the strength of the
change alone — run whatever actually exercises it: the relevant test
suite (`npm run test` / `cargo test` in the affected package(s)), a
typecheck/lint pass, and — for anything touching Rust source — a rebuild
of the consuming WASM/`.so` artifacts, since a source-only fix does
nothing for a consumer until those are rebuilt (see the root AGENTS.md's
"How the engine is built" section). Add a regression test reproducing the
original bug/behavior where practical, not just enough code to make it
compile.

## Ask before every commit and before every publish

Do not commit or run `npm publish` on your own judgment, even mid-task,
even after several were already approved earlier in the same
conversation. Confirm with the user each time, specifically:

- Before creating a git commit (including a version-bump commit).
- Before running `npm publish` for `@kbach/core-engine`, `@kbach/react`,
  or `@kbach/react-native`.

Finish and verify the actual code/doc change first (edit, test, rebuild)
so there's something concrete to confirm — then stop and ask, rather than
committing/publishing and reporting it as already done.

## Every publish tags both `beta` and `latest`

`beta` and `latest` are kept in sync — every `npm publish` (once the user
has confirmed it, per the rule above) sets **both** tags to the version
just published, for every package being published in that round:

```sh
npm publish --tag beta
npm dist-tag add <package>@<version> latest
```

Do this for whichever of `@kbach/core-engine` / `@kbach/react` /
`@kbach/react-native` actually got published — not the other two just
because they happen to already be tagged `latest` from a prior release; a
package that wasn't republished keeps its existing `latest` exactly as it
was. `beta` still means "actively worked on" in spirit — it just no
longer trails `latest` by design the way it did through 2026-09 (`latest`
frozen on the pre-rewrite `1.0.0-beta.2`/`0.6.51`/`1.0.0-beta.0` for
months while `beta` moved on, which is what put the retired
`@kbach/android` dependency on the npm page in the first place).
