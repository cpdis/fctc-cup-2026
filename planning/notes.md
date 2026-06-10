# FCTC Cup — planning notes

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
