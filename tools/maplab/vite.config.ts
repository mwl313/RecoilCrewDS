import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: ROOT,
  base: './',
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../../src', import.meta.url)),
    },
  },
  server: {
    port: 5180,
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist-maplab', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  worker: {
    format: 'es',
  },
});
