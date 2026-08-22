import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbach } from '@kbach/react/vite';

export default defineConfig({
  // 'attribute' (writes data-theme to <html>) rather than the package's
  // default 'media' — this sandbox dogfoods useTheme()'s manual toggle
  // (see App.tsx's theme-provider-toggle/toggle-btn), which only has a
  // visible effect under 'class'/'attribute'; 'media' ignores DOM state
  // entirely and only ever follows the OS preference.
  plugins: [kbach({ config: { darkMode: 'attribute' } }), react()],
});
