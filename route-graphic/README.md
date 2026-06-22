# Herdsman route — water hazard reconnaissance

A light-mode, Tufte-minded map of the FCTC Cup loop with field photos placed at
their exact GPS spots, built to plan the race line around impassible water.

- **`route-hazards.pdf`** — the deliverable (vector, print-ready). `route-hazards.jpg` is a preview.
- **`render_route.py`** — reads GPS from every JPEG in `photos/`, snaps each to
  `../Inaugural_FCTC_.gpx`, and lays the photos around the route with leader lines,
  a legend, and text-only "verify" markers (`NOTES`, e.g. the NE footbridge).
- **`geotag.py`** — writes GPS EXIF into the photos that lost it (IMG_0193, IMG_0194,
  IMG_1861), producing `geotagged/` copies.
- **`photos/`** — the four geotagged photos drawn on the map.
- **`fonts/`** — drop the licensed **Berkeley Mono** here to use it; otherwise the
  script falls back to a bundled monospace.

## Hazards (clockwise distance along route)

| Spot | km | Status |
| --- | --- | --- |
| Footbridge over the channel (IMG_0195) | 1.77 | clear |
| Bench junction puddle (IMG_0196) | 3.23 | hazard |
| Flooded paperbark section (IMG_1860 / 0193) | 5.28 | hazard |
| NE footbridge | 6.23 | **verify Wed AM prerun** |
| Wide puddle on churned track (IMG_0194 / 1861) | 7.25 | hazard |

Re-run: `python3 render_route.py`
