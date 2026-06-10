# FCTC Cup — Herdsman Lake race replay

A published, replayable visualisation of the **FCTC Cup**: every year on the
Wednesday nearest the Perth winter solstice, the Filament Coffee Track Club runs
the 7.74 km loop around Herdsman Lake. Before the gun, everyone commits to a
finish time **down to the second** — and the winner is whoever finishes closest
to their own prediction, not whoever is fastest.

This site replays the whole field at once. Each runner gets a colour:

- a faint **ghost** marker sweeps the loop at their *predicted* constant pace,
- a solid **icon** of the same colour replays their *actual* run from GPS,
  snapped to the route,
- the **leaderboard** sorts live by closeness to prediction (the Cup standings),
- the **gap chart** shows every runner converging toward their prediction — where
  each line lands *is* the Cup result.

The whole site is the map. It works on phone and desktop, and it's static — the
data is baked at build time and served as plain files. Lives at
[fctc.fun](https://fctc.fun).

## How it works

Everything reduces to one idea: a runner's position is a pure function
`progress(t)` — metres along the route over race-elapsed time. A uniform
arc-length **route lookup table** turns metres into a coordinate, so the runtime
hot path is two array lerps and one batched layer update per runner per frame.

```
                 build time                          run time
GPX ──parse──▶ route LUT (metres → lng/lat)   ┐
GPX ──parse──▶ snap GPS to route ──▶ progress  ├─▶ replay.json ──▶ clock(t)
roster ──────▶ predicted times                 │                    │
fallbacks ───▶ finish-only runners             ┘            ghost = L·t/Tpred
                                                            icon  = lerp(progressM)
                                                              │
                                                    progress → route LUT → lng/lat
                                                              │
                                                  one batched setData on MapLibre
```

- **Deterministic, seekable playback.** One scalar clock drives everything;
  seeking is "set a number and render one frame". The clock is an anchor pair
  (`wallAnchor`, `raceAnchor`) so play/pause/speed/seek are all re-anchoring.
- **Map-matching at build.** Real GPS is projected onto the canonical route with
  monotonic, windowed snapping and start/finish-seam pinning, then resampled to a
  uniform time grid. Turf never runs in the browser.
- **Mixed fidelity.** A runner is either a full GPS track *or* a finish time
  only; both render through the same code path, so a missing GPX never blocks
  launch.
- **Markers** are MapLibre `circle` layers updated in one batched `setData` per
  frame (circles have no symbol fade-on-move trap).

See [`docs/plans/`](docs/plans/) and [`docs/brainstorms/`](docs/brainstorms/) for
the full design.

## Quick start

```bash
npm install
npm run seed-demo   # generate a demo field (6 GPS + 5 finish-only runners)
npm run bake        # parse GPX + roster -> public/replay.json
npm run dev         # http://localhost:5173
```

The basemap (a committed PMTiles extract) and a light/dark theme toggle work
out of the box — see **Basemap** below.

Other scripts:

| Script | Does |
| --- | --- |
| `npm run build` | Bakes data, then builds static output to `dist/` |
| `npm run test` | Runs the Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Serves the built `dist/` locally |

## Race-day workflow

Everything except the runner data is built and deployed in advance, so race
morning is just:

1. **Roster** — edit `data/roster.json`: one entry per runner with their
   predicted finish:
   ```json
   [{ "id": "ada", "name": "Ada", "predicted": "32:30" }]
   ```
2. **GPS** — drop each runner's exported GPX into `data/tracks/<id>.gpx`
   (filename matches the roster `id`).
3. **Fallbacks** — for anyone whose GPX you couldn't get, add their finish time
   to `data/fallbacks.json`:
   ```json
   { "kit": "44:00" }
   ```
   They render as a clean constant-pace icon — no runner blocks the launch.
4. **Bake + deploy** — `npm run build`, then deploy (below). Done before coffee
   gets cold.

A runner with neither a GPX nor a fallback is shown as "no data" and never breaks
the build.

## Basemap

The basemap is a **self-hosted Protomaps PMTiles** extract around the lake —
one static file (`public/basemap.pmtiles`, ~3.5 MB, committed), no API key, no
rate limit, no third-party runtime dependency. It's styled per theme with
`@protomaps/basemaps` flavours; the masthead toggle (and the OS preference)
switches light/dark. See
[`scripts/extract-basemap.md`](scripts/extract-basemap.md) to refresh the
extract.

Setting `VITE_USE_PMTILES=false` in `.env.local` falls back to OpenFreeMap's
hosted styles (keyless): `dark` and `positron`. `VITE_FLAT_BASEMAP=true` uses a
flat inline background (offline / deterministic screenshots).

## Deploy

Static output, so any static host works. For Vercel + `fctc.fun`:

```bash
vercel            # link + deploy a preview
vercel --prod     # promote to production
```

Then add `fctc.fun` under the project's Domains and point its DNS at Vercel.
After the first deploy, enable **Bot Protection + AI bot blocking** in the Vercel
Firewall. `vercel.json` sets long cache headers on the basemap and a short one on
`replay.json`.

## Debugging

- **Markers don't move / wrong positions** — re-bake (`npm run bake`) and check
  the summary line (runner count, duration). In dev, `window.__fctc` exposes
  `{ clock, engine, data }`; e.g. `__fctc.clock.seek(__fctc.clock.durationMs/2)`.
- **A snapped track looks wrong** (jumps, wrong side of the loop) — that's the
  map-matching seam/self-intersection case; the canonical track in
  `tests/match.test.ts` is the reference. Eyeball each real track before shipping.
- **Map never appears** — a slow basemap won't hang the UI (there's a load
  timeout), but check the basemap source. Try `VITE_FLAT_BASEMAP=true`.

## Project structure

```
data/            roster, per-runner GPX, finish-only fallbacks (race-day inputs)
scripts/         build-time: GPX parse, route LUT, map-matching, bake, seed-demo
src/             runtime: map, clock, engine, transport, leaderboard, gapchart, layout
tests/           Vitest specs (geo, route, match, clock, standings, engine, …)
public/          basemap.pmtiles (committed) + baked replay.json (generated)
docs/            brainstorm + plan
```

## Tech

Vite + vanilla TypeScript · MapLibre GL JS · Turf.js · `@tmcw/togeojson` ·
Protomaps PMTiles + `@protomaps/basemaps` · Vitest. No framework on the 60 fps path — the map and
animation layer are deliberately imperative.
