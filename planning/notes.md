# FCTC Cup — planning notes

## Session Update - 2026-06-24 (RACE DAY — PARKED)

### What Was Done
- **Live with the real 2026 result at fctc.fun/cup.** Loaded the 17 real
  runners + final predicted times; pre-race predicted-pace preview mode
  (`race.prerace`); palette expanded to 17 distinct hues; removed orphan demo
  tracks.
- **Official times are the source of truth** (`data/results.json`) for every
  finish/delta/standing. Winner **Alex King 👑 by 0:04**. GPS only ever draws
  motion (scaled to the official finish via `matchToFinish`).
- **Pivoted to constant-pace-only:** dropped all 9 GPX (Strava strips timestamps
  from others' exports; the self-intersecting loop caused snapping glitches).
  Result identical; GPX code path kept dormant + a >1.5×-loop auto-skip guard.
- **Leaderboard** shows actual time + differential; DNS rows (Claire, Rhys) read
  "DNS".
- **Custom OG link-preview image** (`scripts/make-og.ts`, `npm run og`) from the
  real route; og:/twitter: meta wired in index.html; verified live.

### Current State
- Pushed to `main` (HEAD 2f83c29). 71/71 tests, typecheck + build clean.
  Everything verified in Chrome and on the live URL.

### Next Steps
- [ ] Optional: drop the 5 missing GPX + a trimmed Grant track into
      `data/tracks/<id>.gpx` and re-bake to add real motion (currently
      constant-pace by choice; GPX reintroduces snapping risk).
- [ ] Scraper cache: already-shared links may show the old card until expiry.

### Blockers
- None.

---

## Session Update - 2026-06-10 (PARKED — end of day)

### What Was Done
- Full iteration day on top of yesterday's build, all live at **fctc.fun/cup**:
  - Fixed hidden runners (engine layer-add gated on `isStyleLoaded()`) and the
    locked camera (`maxBounds` +25% → +125% with chrome-aware fit padding).
  - Light/dark themes (`src/theme.ts`, masthead toggle, no-flash, theme-color
    sync), self-hosted PMTiles basemap (committed, both flavours,
    `@protomaps/basemaps`).
  - Perf: parked replay now does ZERO map renders (halo = CSS DOM marker,
    `clock.atEnd` removed from frame gate); ghosts+trails = 2 setData/frame.
  - Auto-follow camera (`src/camera.ts`): tight on the start pack, widens with
    separation, gesture disarms, masthead crosshair re-arms.
  - Runner figures (`src/figures.ts`): animated stick figures, coloured heads,
    pace-based cadence, dust kicks, finish corral (2-row crowd) + breathing,
    winner victory hop; finish pops with per-runner delta chips.
  - Gap chart legibility (tinted halves, on-half labels, playhead dots) +
    viewport centring; desktop panel hugs rows.
  - Mobile: peek chip rail (names+deltas over the map), safe-area top fade,
    transport/sheet overlap fix.
  - Shipped: repo cpdis/fctc-cup-2026, Vercel (git-connected), Cloudflare
    worker `fctc2025-proxy` extended with /cup (source versioned at
    scripts/fctc-proxy-worker.js).
- Planned the fctc.fun hub site →
  `~/Documents/Personal Projects/fctc-site/docs/plans/2026-06-10-001-feat-fctc-hub-site-plan.md`.
- Cloudflare agent access solved: account-owned token in ~/.bashrc (all
  zones, DNS:Edit + Workers Routes), verified; wrangler OAuth covers script
  deploys (use `env -u CLOUDFLARE_API_TOKEN` for wrangler until the token
  gains Workers Scripts).

### Current State
- Production: fctc.fun/cup serving demo data (11 runners, Gia wins −0:04).
  64/64 tests, typecheck + build clean. Everything committed and pushed.

### Next Steps
- [ ] Enable Bot Protection + AI bot blocking in Vercel Firewall for
      fctc-cup-2026 (dashboard one-click — past bot incident).
- [ ] Implement the fctc.fun hub site in a fresh instance (plan is ready;
      open the fctc-site folder and start from the plan doc).
- [ ] Race morning: real GPX into data/tracks/<id>.gpx, predictions into
      data/roster.json, fallbacks, `npm run build`, push.
- [ ] Optional: /code-review pass on the cup repo; delete stray
      planning/pmtiles binary (55 MB, gitignored).

### Blockers / Open Questions
- None blocking. Hub-site open questions live in its plan doc (stack veto,
  canonical fonts, analytics, Framer imagery check).

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

### Mobile polish (9477c0a)
- Peek chip rail (names + deltas over the map), safe-area top fade,
  theme-color follows toggle, transport/sheet overlap fixed.
