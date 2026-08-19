import { defineConfig } from 'tsup';

// Every entry here that has a `.web` counterpart MUST produce a
// correspondingly-named dist file (e.g. jsx-runtime -> dist/jsx-runtime.js,
// 'jsx-runtime.web' -> dist/jsx-runtime.web.js) — this is what Metro's
// platform-extension resolution actually swaps between at the app's own
// bundle time. A single source file with an internal Platform.OS branch
// does NOT work here: tsup/esbuild flattens `./nativeBridge` at THIS
// build's own resolve time (plain Node resolution, no notion of RN's
// `.web.ts` convention at all), permanently baking in whichever
// implementation the source imported — see jsx-runtime.tsx's doc comment
// for the exact crash this caused before the entries were split.
//
// NATIVE entries (index/jsx-runtime/jsx-dev-runtime) are CJS-ONLY — no
// `.mjs` build, and package.json's "exports" map has no top-level `"import"`
// condition for them. This is deliberate, not an oversight: confirmed by
// inspecting a REAL Metro Android bundle that Metro resolves DIFFERENT
// subpaths of the SAME package through DIFFERENT conditions depending on
// the call site — the bare `@kbach/react-native` import resolved through
// "import" (→ index.mjs), while React's automatic-JSX-runtime injection
// resolved `@kbach/react-native/jsx-dev-runtime` through "require" (→
// jsx-dev-runtime.js) in the SAME bundle. Since ESM and CJS are always
// separate module graphs (even a `require("./theme")` vs `import
// ... from "./theme.mjs"` pointing at "the same" logical module never
// share an instance across formats), that inconsistency reintroduced two
// independent copies of darkModeStore.ts's state — this is what actually
// caused `dark:` classes to stay stale after toggling in a real Expo Go /
// dev-client app, even after the same-format CJS sharing fix below. The
// only way to make this NOT depend on Metro consistently picking one
// condition across every subpath (which turned out to be false) is to not
// offer a second format to inconsistently pick between. Web entries are
// unaffected (kept as ESM+CJS, both formats) since dark: resolves to real
// CSS + a DOM attribute write there, not JS-side singleton state — see
// darkModeStore.ts's own `applyToDom` doc comment.
const nativeEntries = {
  index: 'src/index.ts',
  'jsx-runtime': 'src/jsx-runtime.tsx',
  'jsx-dev-runtime': 'src/jsx-dev-runtime.tsx',
};
const webEntries = {
  'index.web': 'src/index.web.ts',
  'jsx-runtime.web': 'src/jsx-runtime.web.tsx',
  'jsx-dev-runtime.web': 'src/jsx-dev-runtime.web.tsx',
};

export default defineConfig([
  {
    // ESM: web entries only now (see the module-level comment above for
    // why native entries dropped ESM entirely). esbuild code-splits a
    // multi-entry ESM build by default, so index.web.mjs/jsx-runtime.web.mjs
    // already correctly share ONE chunk (and thus one instance) of
    // darkModeStore.ts's/theme.ts's module-level state where it matters
    // (index.web.mjs) — verified directly in the built output.
    entry: webEntries,
    format: ['esm'],
    dts: false, // Same type surface the CJS pass below generates for every entry (native + web) — generating it twice would be redundant.
    // NOT `clean: true` — tsup runs every entry in this defineConfig array
    // CONCURRENTLY (confirmed: both passes' "Build start" logs interleave),
    // so this pass's clean could race the CJS pass below and delete files
    // it just wrote, or vice versa. Cleaning is done once, up front, by the
    // "build"/"dev" npm scripts instead — see their own comments.
    clean: false,
    external: ['react-native'],
  },
  {
    // CJS: every entry (native + web), plus theme/darkModeStore as their
    // own sibling entries. esbuild has no code-splitting support for
    // CommonJS output at all (a hard esbuild limitation, not a config
    // oversight), so without building theme/darkModeStore separately and
    // marking them `external`, every entry below would independently
    // inline its OWN copy of darkModeStore.ts's module-level state
    // (`mode`/`isDark`/`listeners`) and theme.ts's (`activeTheme`).
    //
    // Building them as their own sibling CJS entries and marking them
    // `external` makes every other entry emit a plain
    // `require("./theme")`/`require("./darkModeStore")` instead of inlining
    // — since all these files land as siblings in the same dist/ directory,
    // that relative require resolves to the SAME physical file everywhere,
    // and Node's/Metro's require() cache (keyed by resolved absolute path)
    // naturally gives it single-instance semantics — no public package.json
    // "exports" subpath needed, this is purely an internal sharing
    // mechanism between dist/ siblings.
    entry: { ...nativeEntries, ...webEntries, theme: 'src/theme.ts', darkModeStore: 'src/darkModeStore.ts' },
    format: ['cjs'],
    dts: true, // The only dts pass now — covers every public entry (native + web), since the ESM pass above only builds a subset.
    clean: false, // See the ESM pass's own `clean: false` comment — cleaning happens once, up front, in the npm scripts instead of either tsup pass.
    external: ['react-native', './theme', './darkModeStore'],
  },
]);
