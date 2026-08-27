import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/react/vite';

export default defineConfig({
  // No `config`/`theme` option — kbach() auto-discovers kbach.config.js at
  // this project's root on its own, the same file main.tsx's
  // applyKbachConfig() call imports, so there's one value for both sides to
  // agree on instead of the same literal hand-copied into two places.
  plugins: [kbach(), react()],
});
