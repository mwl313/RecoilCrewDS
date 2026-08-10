import { defineConfig } from '@playwright/test';

const PORT = 18_196;
const BASE_URL = `http://localhost:${PORT}`;
process.env.LANDING_TEST_BASE_URL = BASE_URL;

/** Isolated qualification server so parallel workstreams cannot supply a stale bundle. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'landing-ground-pound.spec.ts',
  timeout: 150_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
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
  webServer: {
    command: 'node dist-server/index.js',
    url: `${BASE_URL}/?test=1`,
    reuseExistingServer: false,
    timeout: 20_000,
    env: {
      PORT: String(PORT),
      GAME_MODE: 'mode.mainStage',
      ALLOW_TEST_DAMAGE: '1',
    },
  },
});
