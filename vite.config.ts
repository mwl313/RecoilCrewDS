import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'dist-server/**'],
  },
});
