import { defineConfig } from '@playwright/test';

/** Focused localization/settings browser suite without unrelated preview servers. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'localization-settings-v2.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8109',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'node dist-server/index.js',
    url: 'http://localhost:8109/?test=1',
    reuseExistingServer: false,
    timeout: 20_000,
    env: { PORT: '8109', GAME_MODE: 'mode.demoScoreAttack' },
  },
});
