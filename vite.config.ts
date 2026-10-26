import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { googleVisionPlugin } from './server/googleVision.ts';
import { fileURLToPath } from 'node:url';

function normalizeBase(value: string | undefined): string {
  const raw = value?.trim() || '/receipt2jan/';
  if (raw === './') return raw;
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

// Portable production assets work at both a Pages domain root and a subpath.
// GitHub Actions can still select an explicit BASE_PATH.
export default defineConfig(({ command, mode }) => ({
  base: normalizeBase(process.env.BASE_PATH ?? (command === 'build' ? './' : undefined)),
  plugins: [react(), googleVisionPlugin({ ...loadEnv(mode, process.cwd(), ''), ...process.env })],
  worker: { format: 'es' },
  optimizeDeps: { include: ['@paddleocr/paddleocr-js'], exclude: ['paddleocr-worker?url'] },
  resolve: {
    alias: [{
      // 0.4.2の公式Workerを同一オリジン資産として出力し、中止時に直接終了できるようにする。
      find: /^paddleocr-worker(?=\?|$)/,
      replacement: fileURLToPath(new URL('./node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-C9UNuyOJ.js', import.meta.url)),
    }],
  },
  build: {
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) },
    target: 'es2022',
    sourcemap: false,
  },
}));
