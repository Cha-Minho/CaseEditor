import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:5184', channel: 'chrome' },
  webServer: { command: 'npm run dev -- --port 5184 --strictPort', url: 'http://127.0.0.1:5184', reuseExistingServer: true },
});
