# Herdsman route — water hazard reconnaissance

A light-mode, Tufte-minded map of the FCTC Cup loop with field photos placed at
their exact GPS spots, built to plan the race line around impassible water.

- **`route-hazards.pdf`** — the deliverable (vector, print-ready). `route-hazards.jpg` is a preview.
- **`render_route.py`** — reads GPS from every JPEG in `photos/`, snaps each to
  `../Inaugural_FCTC_.gpx`, and lays the photos around the route with leader lines,
  a legend, text-only "verify" markers (`NOTES`, e.g. the NE footbridge), and named
  track sections (`SEGMENTS`). Draws a basemap raster feathered out by distance
  from the track (full near the route, fading to paper far away; lake shown in full).
- **`prep_basemap.py`** — caches a CARTO Voyager basemap raster around the lake as
  `basemap.png` + `basemap_bounds.json`. Run once; `render_route.py` reads it.
- **`geotag.py`** — writes GPS EXIF into the photos that lost it (IMG_0193, IMG_0194,
  IMG_1861), producing `geotagged/` copies.
- **`photos/`** — the four geotagged photos drawn on the map.
- **`fonts/`** — drop the licensed **Berkeley Mono** here and it becomes the data
  typeface automatically; otherwise the mono role falls back to Geist Mono.

## Type system (canvas-design pairing)

- **Headings & place names** — *National Park* (the U.S. park-signage typeface):
  title, START/FINISH, section names, photo captions, the NE-footbridge note.
- **Data** — monospace (*Berkeley Mono* if present, else *Geist Mono*): photo ids,
  distances, the subtitle, legend, km ticks, attribution.

## Hazards (distance along route)

| Spot | km | Status |
| --- | --- | --- |
| Footbridge over the channel (IMG_0195) | 1.77 | clear |
| Bench junction puddle (IMG_0196) | 3.23 | hazard |
| First Iynyrd Skynyrd — flooded paperbark section (IMG_1860 / 0193) | 5.28 | hazard |
| Second Iynyrd Skynyrd — NE footbridge | 6.23 | **verify Wed AM prerun** |
| Wide puddle on churned track (IMG_0194 / 1861) | 7.25 | hazard |

Basemap © OpenStreetMap contributors, © CARTO.

Re-run: `python3 prep_basemap.py` (once), then `python3 render_route.py`
