import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Quoridor/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
