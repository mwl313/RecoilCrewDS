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
      env: { PORT: '8099', GAME_MODE: 'mode.demoScoreAttack' },
    },
    {
      command: 'node dist-server/index.js',
      url: 'http://localhost:8096/?test=1',
      reuseExistingServer: true,
      timeout: 20_000,
      env: { PORT: '8096', GAME_MODE: 'mode.mainStage', ALLOW_TEST_DAMAGE: '1' },
    },
    {
      command: 'npm run build:maplab && npx vite preview --config tools/maplab/vite.config.ts --port 8098',
      url: 'http://localhost:8098',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx vite --config tools/enemy-animation-preview/vite.config.ts --port 8097',
      url: 'http://localhost:8097/?monster=1',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
