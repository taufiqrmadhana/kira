import { defineConfig } from 'playwright/test';
import { existsSync } from 'node:fs';

const chrome = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const externalBase = process.env.KIRA_E2E_BASE;
export default defineConfig({
  testDir: '.', testMatch: 'ui.spec.mjs', fullyParallel: true,
  outputDir: '../../../artifacts/ui-tests',
  use: {
    baseURL: externalBase || 'http://127.0.0.1:4180', viewport: { width: 1280, height: 900 },
    launchOptions: { ...(existsSync(chrome) ? { executablePath: chrome } : {}), args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
  },
  webServer: externalBase ? undefined : {
    command: 'npm run build && npx vite preview --outDir ../../dist --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180', reuseExistingServer: false,
  },
});
