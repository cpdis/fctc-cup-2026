# Owned basemap: Protomaps PMTiles extract

The production basemap is a self-hosted PMTiles extract around **Herdsman
Lake** (KTD3). It ships as one static file, `public/basemap.pmtiles` (~3.5 MB,
committed), with no API key, no rate limit, and no third-party runtime
dependency. It styles in both themes via `@protomaps/basemaps` flavours
(`light` / `dark`) in `src/map.ts`.

## Bounding box

The extract covers the map's full roaming area (route bounds padded 1.25× —
keep in sync with `maxBounds` in `src/map.ts`), so panning never hits blank
tiles:

```
west  115.770   south -31.956
east  115.841   north -31.884
```

## Steps (refresh whenever you want newer OSM data)

1. **Install the `pmtiles` CLI**: `brew install pmtiles` (or
   https://github.com/protomaps/go-pmtiles/releases).

2. **Extract the bbox** from the Protomaps daily build straight into the repo
   (use the most recent date that returns a build — probe
   `https://build.protomaps.com/YYYYMMDD.pmtiles`):

   ```bash
   pmtiles extract \
     https://build.protomaps.com/20260609.pmtiles \
     public/basemap.pmtiles \
     --bbox=115.770,-31.956,115.841,-31.884 \
     --maxzoom=16
   ```

   (The daily builds top out at z15; MapLibre overzooms past that, which is
   plenty for a 2 km view.)

3. **It's on by default**: `.env` sets `VITE_USE_PMTILES=true`. To use the
   hosted fallback instead, set `VITE_USE_PMTILES=false` in `.env.local`.

4. **Verify** both themes render (toggle in the masthead), attribution is
   intact (OpenStreetMap · Protomaps), and commit the refreshed file.

## Fallback

With `VITE_USE_PMTILES=false` the app uses OpenFreeMap's hosted styles
(keyless): `dark` for the dark theme, `positron` for light.
