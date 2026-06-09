/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Static SPA. Output goes to dist/ for Vercel. The basemap (.pmtiles) and baked
// replay.json live in public/ and ship as static assets.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
