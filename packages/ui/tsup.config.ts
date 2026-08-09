import { defineConfig } from 'tsup';

// ThemeProvider, DarkWrapper, InteractiveWrapper, styled(), and the hooks
// (useTheme, useColors, useStyles, useBreakpoint, useGlobalDarkMode, …) all
// use React hooks/Context under the hood. Without a "use client" directive at
// the top of the compiled output, importing any of them into a Next.js App
// Router Server Component fails at build time ("You're importing a component
// that needs useState...").
//
// Marking the whole runtime bundle "use client" means consumers never need to
// add the directive themselves just to use Kbach's className prop, styled(),
// or ThemeProvider — the library declares its own client boundary. Only
// vite-plugin.ts is excluded: it's Node-only build tooling (runs inside
// vite.config.ts), never imported by application/runtime code.
const CLIENT_ENTRIES = ['src/index.ts', 'src/jsx-runtime.tsx', 'src/jsx-dev-runtime.tsx'];

// esbuild (which tsup wraps) does not support code-splitting CJS output, so
// without this, dist/index.js, dist/jsx-runtime.js, and dist/jsx-dev-runtime.js
// would each independently inline their OWN complete copy of everything under
// ./core — including the module-level state in darkModeStore.ts,
// responsiveStore.ts, and config.ts. Metro (React Native) loads each of those
// three files by path as an independent CJS module, so three inlined copies
// means three independent stores that never see each other's updates.
// Marking ./core external instead makes all three require() the SAME
// dist/core/index.js at runtime — one real Node module instance, shared the
// normal way (via Node/Metro's require cache), with no workaround needed.
//
// The core build below only produces one bundled dist/core/index.js (not a
// file per submodule), so every runtime (non-type-only) import under
// packages/ui/src/*.ts must go through the './core' barrel rather than a
// submodule path directly — esbuild's `external` matches import specifiers
// literally, and a direct './core/devWarn'-style import would otherwise try
// to resolve a dist/core/devWarn.js that doesn't exist. (Type-only imports
// like shared-utils.ts's `import type { ResolvedStyle } from './core/types'`
// are erased before this matters and don't need to go through the barrel.)
//
// CJS-only fix. package.json's exports map keeps a REAL dual ESM/CJS build
// for these three entries (dist/*.mjs is a genuine, separately-built file,
// same as ./vite) — required for Vite/Rollup, which needs real ESM to
// statically detect named exports (RULES.md rule 7: a CJS-only build broke
// apps/docs's real `vite build`). So only the CJS build needs this fix. The
// ESM build is left exactly as it was: core inlined, shared correctly across
// dist/index.mjs / jsx-runtime.mjs / jsx-dev-runtime.mjs via tsup's own
// multi-entry ESM code-splitting (a real shared chunk file) — esbuild
// supports that for ESM, just not CJS, which is the actual bug this fixes.
// Externalizing core for ESM too would trade that already-correct behavior
// for a plain relative './core' import, which fails under Node's strict ESM
// resolver (ERR_UNSUPPORTED_DIR_IMPORT — a directory import needs an
// explicit file segment there) for zero benefit, since ESM never had the CJS
// bundle-splitting problem to begin with.
const CORE_EXTERNAL = ['./core'];

export default defineConfig([
  {
    entry: CLIENT_ENTRIES,
    format: ['cjs'],
    dts: true,
    clean: true,
    external: ['vite', ...CORE_EXTERNAL],
    banner: { js: "'use client';" },
  },
  {
    // Same source entries, ESM only, kept separate from the CJS step above
    // so `external` can differ per format — see CORE_EXTERNAL's comment.
    // dts:false here: types are format-agnostic and package.json's "types"
    // condition isn't split by import/require, so the CJS step's .d.ts
    // output already covers both.
    entry: CLIENT_ENTRIES,
    format: ['esm'],
    dts: false,
    clean: false,
    external: ['vite'],
    banner: { js: "'use client';" },
  },
  {
    // Built as its own entry so the CJS step above can share ONE compiled
    // copy of it across dist/index.js, dist/jsx-runtime.js, and
    // dist/jsx-dev-runtime.js via require('./core') — see CORE_EXTERNAL's
    // comment. CJS-only: nothing references the ESM half of this build.
    entry: ['src/core/index.ts'],
    format: ['cjs'],
    dts: true,
    clean: false,
    outDir: 'dist/core',
  },
  {
    entry: ['src/vite-plugin.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    external: ['vite'],
  },
  {
    // React Native / Expo entry point (@kbach/ui/native — see
    // src/native/index.ts). CJS-only: package.json's "./native" export routes
    // BOTH "import" and "require" to this same dist/native.js — see
    // NativeThemeProvider.tsx's comment for why a real ESM build would break
    // Metro's require() detection.
    //
    // '@kbach/ui' is marked external (NativeThemeProvider.tsx imports it
    // by bare specifier, not a relative path) so this bundle reaches
    // ThemeProvider/ThemeContext via a real require('@kbach/ui') —
    // resolving to the exact same dist/index.js instance every other
    // consumer gets — instead of esbuild inlining its own private copy of
    // ThemeProvider.tsx/context.tsx, which would split ThemeContext in two.
    // Named-entry form ({ native: ... }) makes esbuild emit a flat
    // dist/native.js in outDir rather than a nested dist/native/index.js —
    // doesn't matter for a bare-specifier external like this one (unlike a
    // relative one, it isn't rewritten based on output depth), but keeps the
    // dist layout flat and predictable alongside the other entries.
    entry: { native: 'src/native/index.ts' },
    format: ['cjs'],
    dts: true,
    clean: false,
    external: ['@kbach/ui'],
    banner: { js: "'use client';" },
  },
]);
