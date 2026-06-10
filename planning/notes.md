# FCTC Cup — planning notes

## Session Update - 2026-06-10 (later: perf + camera + finish UX, commit bcfca93)

### What Was Done
- **Killed the CPU burn** (fans at 100%/tab): the frame gate's `clock.atEnd` term
  kept full 60fps rendering forever once the race ended, just to pulse the winner
  halo. Halo is now a CSS-animated DOM marker; parked replay = 0 map renders
  (measured). Also merged icon+ghost into one source (2 setData/frame, was 4).
- **Auto camera** (`src/camera.ts`): eases toward a padded bbox of the pack each
  hot frame — tight at the start, wide as separation grows. Ground-span clamp
  (~800 m min), not zoom clamp. Gestures disarm; masthead crosshair re-arms.
- **Finish corral + pops**: finishers park in a row beside the line
  (`corralSlots`, pure + tested), ghosts fade once done, name+delta chip floats
  up per finish. Gotcha: animate marker INNER children — animating the marker
  element overrides MapLibre's inline positioning transform (chip pinned at 0,0).
- **Winner card** centered + bigger with canvas-confetti (reduced-motion safe).
  Desktop panel now max-height (hugs rows). 64 tests green.

### Next Steps (unchanged)
- GitHub repo + push, Vercel deploy + fctc.fun DNS, mute light flavour maybe.

## Session Update - 2026-06-10 (afternoon: themes + basemap + bug fixes)

### What Was Done (commit d3db4a5)
- **Fixed runners never appearing**: engine gated layer-add on `isStyleLoaded()`,
  which can stay false forever after the last `styledata` event → marker sources
  never added, `setData` no-oped silently. Now adds eagerly with an idempotent
  `styledata` retry; `main.ts` marks frames dirty after style load so the paused
  t=0 frame paints.
- **Fixed locked camera** (no zoom-out, no sideways pan, start line clipped):
  `maxBounds` (+25%) was smaller than a wide viewport's fitted view, forcing
  MapLibre to zoom IN. Now +125%, with asymmetric fit padding clearing the
  panel/gap chart/sheet.
- **Light mode + theme toggle**: `src/theme.ts` store (saved > OS pref), masthead
  toggle, tokenized CSS palettes, per-theme basemap, no-flash inline script.
  Theme switch = `setStyle`; route + runner layers re-add themselves.
- **Owned basemap**: `public/basemap.pmtiles` (3.4 MB, committed) extracted via
  `pmtiles` CLI (brew) from the 2026-06-09 Protomaps daily build, bbox = roaming
  area. On by default (committed `.env`). Migrated to `@protomaps/basemaps`.
- Verified interactively via Claude in Chrome (localhost blocked in the
  extension — use the LAN URL) + puppeteer captures in `review/index.html`
  (headless works fine WITHOUT the swiftshader args).
- Docs updated (README basemap/themes, extract-basemap.md).

### Current State
- typecheck clean, 60/60 tests, build OK. Both themes verified desktop + mobile,
  winner reveal verified. Dev server on :5173 (`--host`).
- `planning/pmtiles` is a stray 55 MB CLI binary (now gitignored) — Colin to delete.

### Next Steps
- [ ] Create GitHub repo + push; optional `/code-review` pass.
- [ ] Deploy to Vercel, point `fctc.fun` DNS, enable Firewall bot protection.
- [ ] Consider muting the stock Protomaps light flavour (cyan water is loud).
- [ ] Race morning: real GPX + roster + `npm run build` + deploy.

## Session Update - 2026-06-10

### What Was Done
- Full build, idea → working app, in one flow: `/ce-brainstorm` → `/ce-plan` →
  `/emil-design-eng` review → `/ce-work` (all 8 units).
- Durable docs: `docs/brainstorms/2026-06-09-fctc-cup-visualisation-requirements.md`,
  `docs/plans/2026-06-09-001-feat-fctc-cup-visualisation-plan.md` (status: completed).
- Code (branch `feat/cup-visualisation`, 10 commits):
  - Build: `scripts/route.ts` (GPX → uniform route LUT), `scripts/match.ts`
    (map-matching), `scripts/bake-data.ts`, `scripts/seed-demo.ts`, `scripts/gpx.ts`.
  - Runtime: `src/clock.ts`, `src/transport.ts`, `src/engine.ts`, `src/leaderboard.ts`,
    `src/layout.ts`, `src/gapchart.ts`, `src/standings.ts`, `src/geo.ts`, `src/map.ts`,
    `src/main.ts`, `src/style.css`.
  - 60 Vitest tests across geo/route/match/clock/standings/engine/leaderboard/gapchart.
  - `vercel.json`, `README.md`.

### Current State
- Working. `npm run typecheck` clean, `npx vitest run` 60/60, `npm run build` OK.
- Dev server was left running at http://localhost:5173/ (real OpenFreeMap basemap).
- Demo data baked (`public/replay.json`, gitignored): 11 runners, 6 GPS + 5 finish-only,
  Gia wins (−4s). Real basemap (pmtiles) NOT yet produced — dev uses OpenFreeMap fallback.
- Not pushed (no git remote yet).

### Next Steps
- [ ] Eyeball the animation/winner reveal in a real browser (headless screenshots stall
      in swiftshader; app itself is fine).
- [ ] Produce `public/basemap.pmtiles` per `scripts/extract-basemap.md`; set
      `VITE_USE_PMTILES=true`. (Also migrate `protomaps-themes-base` → `@protomaps/basemaps`.)
- [ ] Create GitHub repo + push; optional `/code-review` pass.
- [ ] Deploy to Vercel, point `fctc.fun` DNS, enable Firewall bot protection.
- [ ] Race morning: drop real GPX into `data/tracks/<id>.gpx`, set predicted times in
      `data/roster.json`, finish-only in `data/fallbacks.json`, `npm run build`, deploy.

### Blockers / Open Questions
- None blocking. Real basemap extract + deploy are the only things between here and live.
- `fctc.fun` registrar/DNS not yet confirmed (needed before deploy).

### Gap chart pass (38f6e41)
- Tinted halves, on-half labels with axis range, playhead dots per runner,
  centred (max-width 920px) on wide displays.

### Runner figures (4830e07)
- Stick-figure DOM markers w/ coloured heads replace icon dots; engine renders
  ghosts+trails only; gap chart viewport-centred at >=1280px.

### Whimsy pass (8c927a2)
- Pace cadence, dust kicks, corral crowd + breathing, winner victory hop.

## Session Update - 2026-06-10 (shipped: fctc.fun/cup live)
- Repo cpdis/fctc-cup-2026 (public) + Vercel project (git-connected).
- Vite base /cup/, vercel.json /cup rewrites; Cloudflare worker fctc2025-proxy
  extended with /cup -> fctc-cup-2026.vercel.app (source versioned in
  scripts/fctc-proxy-worker.js). Verified live; dashboard/wrapped/Framer intact.
- TODO: enable Vercel Firewall bot protection on fctc-cup-2026 (manual).
