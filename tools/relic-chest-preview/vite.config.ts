import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: ROOT,
  base: './',
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  server: { port: 5192 },
  build: {
    outDir: fileURLToPath(new URL('../../dist-relic-chest-preview', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
});
