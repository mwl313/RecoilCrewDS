import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 150_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8099',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  },
  webServer: [
    {
      command: 'node dist-server/index.js',
      url: 'http://localhost:8099/?test=1',
      reuseExistingServer: true,
      timeout: 20_000,
      env: { PORT: '8099' },
    },
    {
      command: 'npm run build:maplab && npx vite preview --config tools/maplab/vite.config.ts --port 8098',
      url: 'http://localhost:8098',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
