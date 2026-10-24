import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function normalizeBase(value: string | undefined): string {
  const raw = value?.trim() || '/receipt2jan/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolveBase(): string {
  // Cloudflare Pages は Production / Preview の全ビルドで CF_PAGES=1 を設定する。
  // どちらもサイトのルート直下に配信されるため、base は '/' にする。
  if (process.env.CF_PAGES === '1') {
    return '/';
  }

  // GitHub Pages のプロジェクトページでは、リポジトリ名のサブパスに配備される。
  // 既定値は仕様書の想定に合わせ、Actions では BASE_PATH をリポジトリ名から渡す。
  return normalizeBase(process.env.BASE_PATH);
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
