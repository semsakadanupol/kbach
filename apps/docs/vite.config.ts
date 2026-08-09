import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/ui/vite';

// Static CSS setup — Phase 3a's recommended default. jsxImportSource comes
// from tsconfig.json's compilerOptions only (not repeated here on react()) —
// see packages/ui/README.md's Step 1 for why setting it in both places
// risks a conflict.
export default defineConfig({
  plugins: [react(), kbach()],
});
