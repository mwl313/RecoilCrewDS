import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.BOUNDARY_TEST_PORT ?? 18_204);
const BASE_URL = `http://localhost:${PORT}`;

/** Isolated boundary qualification so another workstream cannot serve a stale bundle. */
export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'arena-boundary.spec.ts',
    'arena-boundary-lifecycle.spec.ts',
    'gameplay-readability-tactical.spec.ts',
    'lobby-reconnect.spec.ts',
  ],
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
    cwd: process.env.BOUNDARY_SERVER_CWD,
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
