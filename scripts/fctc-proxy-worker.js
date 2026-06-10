// Cloudflare Worker `fctc2025-proxy` — path router for the fctc.fun zone.
//
// fctc.fun's apex is a Framer site; everything app-shaped lives on Vercel
// behind path prefixes. This worker (catch-all route on fctc.fun/*) sends:
//
//   /dashboard*            -> fctc2025.cpd.dev (path minus /dashboard)
//   /2025wrapped*          -> fctc2025.cpd.dev/wrapped*
//   /assets, /data, logo…  -> fctc2025.cpd.dev (dashboard's root assets)
//   /cup*                  -> fctc-cup-2026.vercel.app (self-contained: the
//                             cup app is built with base /cup/, so the path
//                             passes through unchanged — no root collisions)
//   everything else        -> origin (Framer)
//
// Deploy (needs wrangler auth):
//   npx wrangler deploy scripts/fctc-proxy-worker.js \
//     --name fctc2025-proxy --compatibility-date 2025-12-11
//
// The zone route (fctc.fun/*) is attached to the worker in the Cloudflare
// dashboard and survives script deploys.

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Proxy /dashboard to Vercel
    if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
      const newPath = url.pathname.replace('/dashboard', '') || '/';
      const targetUrl = `https://fctc2025.cpd.dev${newPath}${url.search}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return response;
    }

    // Proxy /2025wrapped to Vercel's /wrapped
    if (url.pathname === '/2025wrapped' || url.pathname.startsWith('/2025wrapped/')) {
      const newPath = url.pathname.replace('/2025wrapped', '/wrapped');
      const targetUrl = `https://fctc2025.cpd.dev${newPath}${url.search}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return response;
    }

    // Proxy /cup to the FCTC Cup replay. The cup app is built with base
    // /cup/ and rewrites /cup/* itself, so the path passes through as-is.
    if (url.pathname === '/cup' || url.pathname.startsWith('/cup/')) {
      const targetUrl = `https://fctc-cup-2026.vercel.app${url.pathname}${url.search}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return response;
    }

    // Proxy /assets, /data, and static files to Vercel
    if (url.pathname.startsWith('/assets/') ||
        url.pathname.startsWith('/data/') ||
        url.pathname === '/fctc_logo.jpeg' ||
        url.pathname === '/coffee.svg') {
      const targetUrl = `https://fctc2025.cpd.dev${url.pathname}${url.search}`;
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      return response;
    }

    // Everything else goes to origin (Framer)
    return fetch(request);
  },
};
