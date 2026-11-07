import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // @kbach/react's own setup (jsdom localStorage fix): this package runs
    // react's runtime modules, so it needs the same environment.
    setupFiles: ['../react/src/test-setup.ts'],
  },
});
