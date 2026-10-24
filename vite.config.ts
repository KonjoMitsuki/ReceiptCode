import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function normalizeBase(value: string | undefined): string {
  const raw = value?.trim() || '/receipt2jan/';
  if (raw === './') return raw;
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

// Portable production assets work at both a Pages domain root and a subpath.
// GitHub Actions can still select an explicit BASE_PATH.
export default defineConfig(({ command }) => ({
  base: normalizeBase(process.env.BASE_PATH ?? (command === 'build' ? './' : undefined)),
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
}));
