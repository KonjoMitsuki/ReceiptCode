import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173/receipt2jan/';
const previewBaseURL = 'http://127.0.0.1:4175/receipt2jan/';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: [
    {
      command:
        'npm run dev:e2e -- --host 127.0.0.1 --port 4173 --strictPort',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // 本番ビルドをサブパスで配信し、静的資産と画面遷移を検証する。
      // 常に現在のソースからビルドし、古い成果物でテストしない。
      command:
        'npm run build && npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
      url: previewBaseURL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
