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

export default defineConfig([
  {
    entry: CLIENT_ENTRIES,
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    external: ['vite'],
    banner: { js: "'use client';" },
  },
  {
    entry: ['src/vite-plugin.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    external: ['vite'],
  },
]);
