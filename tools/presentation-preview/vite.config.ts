import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: ROOT,
  base: './',
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  server: { port: 5190 },
  build: {
    outDir: fileURLToPath(new URL('../../dist-presentation-preview', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
