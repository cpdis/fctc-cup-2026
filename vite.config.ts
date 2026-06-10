/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Static SPA. Output goes to dist/ for Vercel. The basemap (.pmtiles) and baked
// replay.json live in public/ and ship as static assets.
//
// base is /cup/ because the app lives at fctc.fun/cup behind a Cloudflare
// path-routing Worker, and the domain's root namespace (/assets, …) already
// belongs to the dashboard app. Every URL this app requests must stay under
// its own prefix; vercel.json rewrites /cup/* -> /* so the Vercel deployment
// serves the prefixed paths.
export default defineConfig({
  base: '/cup/',
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
