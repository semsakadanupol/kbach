import { defineConfig } from 'tsup';

// Mirrors packages/react/tsup.config.ts: every entry here re-exports (or is)
// hook/Context-using React code — index.ts re-exports the whole @kbach/react
// runtime plus NativeThemeProvider, and jsx-runtime/jsx-dev-runtime route
// through DarkWrapper/InteractiveWrapper. "use client" is a no-op for Metro
// (React Native's bundler), but it's required for Expo's experimental React
// Server Components support and keeps the two packages' build output
// consistent.
export default defineConfig({
  entry: ['src/index.ts', 'src/jsx-runtime.ts', 'src/jsx-dev-runtime.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  banner: { js: "'use client';" },
});
