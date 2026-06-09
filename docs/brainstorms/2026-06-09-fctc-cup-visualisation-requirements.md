---
date: 2026-06-09
topic: fctc-cup-visualisation
---

# FCTC Cup 2026 — Race Visualisation

## Summary

A published, replayable web visualisation of the FCTC Cup: ~10–15 runners circling
the 7.74 km Herdsman Lake loop, each racing against the finish time they predicted
beforehand. Every runner gets a colour. Their **predicted** pace is a faint "ghost"
marker plus trail sweeping the loop at constant pace; their **actual** run is a solid
icon of the same colour, replayed from real GPS and snapped to the route. The whole
site is the map. Closest actual-to-predicted finish wins the Cup, shown live on a
leaderboard. Goal: live on fctc.fun the morning after the race.

## Problem Frame

The Cup is a prediction race: before the gun, everyone commits to a finish time down
to the second, and the winner is whoever lands closest to their own prediction, not
whoever is fastest. That makes for a genuinely fun spectator object that a plain
results table throws away. The drama lives in the gap between what you said you'd do
and what you actually did, second by second, all the way around the lake. A
side-by-side replay of every runner against their own ghost is the natural way to
show it, and a 15-person friend group will actually open it and argue about it.

## Key Decisions

- **Published replay, not live tracking.** The site is built and shipped the morning
  after the race from collected data. No real-time-during-race infrastructure. This is
  simpler, more reliable, and matches the "later that morning" goal.

- **Everything reduces to progress-along-route over elapsed time.** Both the ghost
  and the actual icon collapse to a single 1-D function per runner:
  `progress(t)` ∈ [0, 7.74 km]. The ghost is linear (`L · t / T_predicted`). The actual
  icon is derived from GPS snapped to the route. A finish-time-only runner is also
  linear (`L · t / T_actual`). This one model drives all rendering and is the
  load-bearing simplification of the whole build.

- **Muted real basemap (MapLibre + free OSM/vector tiles).** The lake reads as the
  real place. Camera fits the route bounds by default. Markers and route render as
  overlay layers on top; animation updates each marker's coordinate per frame by
  interpolating along the route polyline. (Note: `offset-path` does not apply over a
  pannable basemap — coordinate interpolation is the right primitive here.)

- **Ghost pacer + trail for predicted; solid icon for actual.** Faint same-colour
  ghost moving at constant predicted pace, leaving a thin trail; solid icon for the
  real run. Actual ahead of ghost = beating your prediction. Instantly legible.

- **Elapsed-time master clock, single shared timeline.** All runners visually start
  together at t=0 at the loop start. The clock measures elapsed time, which is exactly
  what the Cup judges. One play/pause/scrub/speed control governs the whole field.

- **GPX-file ingestion with a finish-time fallback.** Primary source is each runner's
  GPX (exported or pulled from the club feed), parsed at build time. Any runner whose
  GPX can't be obtained degrades gracefully to a finish-time-only constant-pace icon.
  No Strava OAuth app, no API keys, no rate limits, no per-runner blocking of launch.

## Actors

- **Organiser (Colin)** — collects predicted times before the race, collects GPX files
  (and any finish-time fallbacks) after, runs the build, ships the site.
- **Runners (~10–15)** — each contributes a predicted finish time and (ideally) a GPX
  track. They're also the primary audience.
- **Viewers** — runners and the wider club watching on phone or desktop the morning
  after.

## Key Flows

### Organiser: prep → publish
1. Before race: gather `{name, predicted_finish_time}` for each runner; assign colours.
2. After race: collect each runner's GPX into a folder; note finish times for anyone
   missing a GPX.
3. Run the build: parse GPX, snap to canonical route, compute `progress(t)` per runner,
   bake a single static data file.
4. Deploy to Vercel; fctc.fun resolves to it.

### Viewer: watch the replay
1. Land on fctc.fun → map of the lake with the field staged at the start line.
2. Press play (or it autoplays muted). Ghosts and icons sweep the loop on a compressed
   timeline; leaderboard updates live.
3. Tap/click a runner → highlight their line + icon + ghost, dim the rest, surface their
   predicted/actual/delta.
4. Scrub or change speed to inspect any moment. As each icon finishes, its delta locks
   and the leaderboard re-sorts. Closest delta is crowned Cup winner.

## The unifying position model

```
            elapsed time  t  ───────────────▶
progress
 7.74km ┤                              ✦ ghost finishes at T_predicted
  (L)   │                         ●    (linear, constant pace)
        │                    ●  ·✦
        │               ● ·✦          ● = actual icon (GPS snapped to
        │          ●·✦                    route → distance along loop)
        │     ●·✦                     ✦ = ghost (predicted, linear)
      0 ┼──●✦──────────────────────────▶
        start                          gap(t) between ● and ✦ =
                                       how far ahead/behind prediction

Finish-time-only runner: ● is also a straight line, just to T_actual.
Render step: progress → interpolate lng/lat at that distance along the
route polyline → set marker position. Same code path for ghost & icon.
```

## Requirements

### Map & route
- **R1** — Render a muted, minimal basemap of Herdsman Lake via MapLibre GL JS with
  free vector/raster tiles; the lake must read as the real location.
- **R2** — Draw the canonical 7.74 km loop (derived from the provided GPX) as a styled
  route line on top of the basemap.
- **R3** — Default camera fits the route bounds; the framing is the whole site. World
  pan/zoom is not a goal (incidental pinch-zoom is acceptable but not required).
- **R4** — The full visualisation must be legible and performant on both phone and
  desktop.

### Predicted vs actual model
- **R5** — Each runner has a colour, a predicted finish time, and either a GPS track or
  a finish time. Colours are distinct and bright against the dark basemap.
- **R6** — Predicted pace renders as a faint same-colour ghost marker moving at constant
  pace (finish at `T_predicted`), leaving a thin colour trail along the loop.
- **R7** — Actual run renders as a solid same-colour icon. With GPS, its position comes
  from the real track snapped to the route; without GPS, it moves at constant pace to
  the runner's real finish time.
- **R8** — Both markers are positioned by interpolating coordinate at `progress(t)`
  distance along the route polyline — one shared rendering path.

### Data ingestion & fidelity
- **R9** — GPX files are the primary actual-data source, parsed at build time into the
  baked data file. No live Strava API / OAuth dependency.
- **R10** — Each runner independently degrades to finish-time-only if no GPX is
  available; missing GPX for some runners must never block launch.
- **R11** — Actual GPS points are map-matched (projected onto the nearest point of the
  canonical route) and converted to cumulative distance along the loop, so every icon
  rides the same clean line and GPS noise can't throw an icon off-route.
- **R12** — Predicted times are supplied as simple structured input (e.g. a
  `{name, predicted}` list the organiser maintains); exact format is a planning detail.

### Playback & timeline
- **R13** — A single master clock measures elapsed time; all runners start together at
  t=0 at the loop start.
- **R14** — Controls: play/pause, scrub to any time, and speed control. The full race
  tops out around ~45 min, so the default playback compresses it into a short watch
  (~1–2 min, i.e. roughly 25–45× real time) so nobody waits in real time; speed is
  adjustable.
- **R15** — The clock runs until the last of any actual or predicted finish, so every
  ghost and icon completes on screen.

### Info display & responsive layout
- **R16** — A leaderboard lists each runner: colour swatch, name, predicted, actual (or
  "running"), and delta (signed mm:ss, early/late). It sorts live by smallest |delta|.
- **R17** — The closest finisher is clearly crowned the Cup winner (🏆).
- **R18** — Desktop: map full-bleed with the leaderboard docked as a side panel and the
  playback bar pinned at the bottom. Mobile: map full-bleed with the leaderboard as a
  draggable bottom sheet (collapsed handle shows the leader; expand for the full field)
  and the playback bar above the sheet handle.
- **R19** — Selecting a runner (tap/click; hover on desktop) highlights their line,
  icon, and ghost and dims the others, surfacing their predicted/actual/delta.

### Publishing & ops
- **R20** — The site is effectively static: data is baked at build time and served as
  static assets; no runtime backend required.
- **R21** — Deployed on Vercel and served from fctc.fun; ready to publish the morning
  after the race.

## Acceptance Examples

- **Mixed fidelity** — Given 12 runners with GPX and 2 finish-time-only, when the
  replay plays, then all 14 icons animate around the loop; the 2 fallback icons move at
  steady pace while the GPX icons show real surges/fades, and all 14 appear on the
  leaderboard with correct deltas.
- **Beating your prediction** — Given a runner whose actual icon is ahead of their
  ghost at time t, then the visual reads as "ahead of schedule," and if they hold it
  their delta resolves as finishing earlier than predicted (signed "−mm:ss").
- **Finish reveal & standings** — When a runner's icon completes the loop, then their
  delta locks, the leaderboard re-sorts by |delta|, and when the last
  runner/ghost finishes the smallest-|delta| runner is crowned winner.
- **No GPX at all for someone** — Given a runner with neither GPX nor a usable finish
  time at build, then the build still succeeds and either omits that runner or shows
  them as "no data" rather than failing — launch is never blocked by one missing track.
- **Phone view** — Given a phone viewport, when the page loads, then the map is
  full-bleed, the leaderboard is a collapsed bottom sheet showing the current leader,
  and play/scrub/speed are reachable with a thumb.

## Success Criteria

- Live on fctc.fun the morning after the race, from data the organiser can collect and
  build in well under an hour.
- A viewer who has never seen it understands within ~10 seconds that each runner is
  racing their own prediction.
- Smooth animation (~60fps target) with ~30 moving markers on a mid-range phone.
- The build tolerates partial/messy data: missing GPX, noisy GPS, odd predicted times.
- It looks intentional and on-brand, not like a generic dashboard.

## Scope Boundaries

**Not in v1**
- Live, real-time tracking during the race.
- Strava OAuth integration / automated per-athlete API pulls.
- World-scale map pan/zoom or basemap exploration.
- Historical multi-year archive of past Cups (nice later; the data model should not
  actively prevent it, but it isn't built now).
- Accounts, auth, or any runner-facing data entry UI (organiser curates the data).

**Explicitly fine to be simple**
- Predicted pace is constant (a pick is a single number); no per-segment prediction.
- Colour set tuned by hand; 15 distinct hues is near the perceptual limit, mitigated by
  labels and highlight-on-select rather than solved perfectly.

## Dependencies / Assumptions

- The provided `Inaugural_FCTC_.gpx` (2025 run) is the canonical route geometry: 7.74 km
  closed loop, start ≈ end within 1.5 m.
- Mass start confirmed: all runners share a common t=0 and are compared on elapsed time,
  which is exactly the master-clock model. Slowest expected finish is ~45 min, the upper
  bound used to size the timeline and default playback compression.
- Runners will provide GPX (or at least a finish time) the morning after; the organiser
  collects and curates.
- fctc.fun is (or will be) registered and its DNS can be pointed at Vercel (registrar
  TBD — confirm before deploy).
- Predicted finish times are gathered out-of-band before the race.

## Outstanding Questions

**Deferred to planning**
- Exact tech stack (Vite SPA vs Next static export), data file shape, and build script
  for GPX → snapped `progress(t)`.
- Marker rendering primitive on MapLibre (DOM markers vs symbol layer vs canvas overlay)
  and the route-projection/smoothing algorithm.
- Colour palette specifics and the icon design.
- Leaderboard interaction details and exact mobile bottom-sheet behaviour.

## Sources / Research

- `Inaugural_FCTC_.gpx` — 2025 inaugural run, one runner's track. 2,137 points at 1 Hz;
  7.74 km; closed loop (start–end gap 1.5 m); bbox ~2.3 km × 1.9 km; sample finish ~35.6
  min. Used as canonical route geometry and a realistic pace/duration reference.
- FCTC = Filament Coffee Track Club; event is annual, the Wednesday nearest the Perth
  winter solstice, around Herdsman Lake.
