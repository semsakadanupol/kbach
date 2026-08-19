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
const publicEntries = {
  index: 'src/index.ts',
  'index.web': 'src/index.web.ts',
  'jsx-runtime': 'src/jsx-runtime.tsx',
  'jsx-runtime.web': 'src/jsx-runtime.web.tsx',
  'jsx-dev-runtime': 'src/jsx-dev-runtime.tsx',
  'jsx-dev-runtime.web': 'src/jsx-dev-runtime.web.tsx',
};

export default defineConfig([
  {
    // ESM: esbuild code-splits a multi-entry ESM build by default, so
    // index.mjs/jsx-runtime.mjs/jsx-dev-runtime.mjs already correctly share
    // ONE chunk (and thus one instance) of darkModeStore.ts's and theme.ts's
    // module-level state — verified directly in the built output. Nothing
    // extra needed here; do NOT add the CJS pass's `external` below to this
    // config — esbuild emits an extension-less `from "./theme"` for an
    // externalized *relative* ESM import, which Node's/Metro's ESM resolver
    // rejects outright (no file literally named `theme`, only `theme.mjs`).
    entry: publicEntries,
    format: ['esm'],
    dts: true,
    // NOT `clean: true` — tsup runs every entry in this defineConfig array
    // CONCURRENTLY (confirmed: both passes' "Build start" logs interleave),
    // so this pass's clean could race the CJS pass below and delete files
    // it just wrote, or vice versa. Cleaning is done once, up front, by the
    // "build"/"dev" npm scripts instead — see their own comments.
    clean: false,
    external: ['react-native'],
  },
  {
    // CJS: esbuild has no code-splitting support for CommonJS output at all
    // (a hard esbuild limitation, not a config oversight), so without this
    // second pass, EVERY entry below independently inlines its OWN copy of
    // darkModeStore.ts's module-level state (`mode`/`isDark`/`listeners`)
    // and theme.ts's (`activeTheme`). That's not cosmetic: React's
    // automatic JSX runtime makes a consuming app's Babel resolve
    // '@kbach/react-native/jsx-runtime' as a SEPARATE module specifier from
    // '@kbach/react-native' itself, so `useTheme()` (via the index entry)
    // and the `dark:`/theme-aware JSX interception (via the jsx-runtime
    // entry) would end up reading and notifying two entirely independent
    // stores — toggling via `useTheme().toggle()` updates `isDark` for
    // anything that also came through the index entry, while every
    // `dark:`-prefixed class (resolved through the jsx-runtime entry) never
    // finds out and stays stale. Confirmed by inspecting the actual CJS
    // build: index.js/jsx-runtime.js/jsx-dev-runtime.js each separately
    // defined getGlobalDarkMode/subscribeGlobalDarkMode/listeners before
    // this fix.
    //
    // Building theme/darkModeStore as their own sibling CJS entries and
    // marking them `external` makes every other entry emit a plain
    // `require("./theme")`/`require("./darkModeStore")` instead of inlining
    // — since all these files land as siblings in the same dist/ directory,
    // that relative require resolves to the SAME physical file everywhere,
    // and Node's/Metro's require() cache (keyed by resolved absolute path)
    // naturally gives it single-instance semantics — no public package.json
    // "exports" subpath needed, this is purely an internal sharing
    // mechanism between dist/ siblings.
    entry: { ...publicEntries, theme: 'src/theme.ts', darkModeStore: 'src/darkModeStore.ts' },
    format: ['cjs'],
    dts: false, // Same type surface as the ESM pass above; generating it twice would be redundant. theme.ts/darkModeStore.ts have no public "exports" subpath, so they don't need their own .d.ts either.
    clean: false, // See the ESM pass's own `clean: false` comment — cleaning happens once, up front, in the npm scripts instead of either tsup pass.
    external: ['react-native', './theme', './darkModeStore'],
  },
]);
