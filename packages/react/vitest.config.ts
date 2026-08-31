import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Source only — dist/ is build output, test-setup.ts is test
      // infrastructure with nothing of its own to cover, and .test.ts files
      // measuring their own coverage is meaningless.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts'],
    },
  },
});
