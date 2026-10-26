import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{
    find: /^paddleocr-worker(?=\?|$)/,
    replacement: fileURLToPath(new URL('./node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-C9UNuyOJ.js', import.meta.url)),
  }] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/components/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
