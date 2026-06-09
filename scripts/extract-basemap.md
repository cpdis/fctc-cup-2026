# Owned basemap: Protomaps PMTiles extract

The production basemap is a self-hosted PMTiles extract of **just the Herdsman
Lake bounding box** (KTD3). It ships as one static file, `public/basemap.pmtiles`,
with no API key, no rate limit, and no third-party runtime dependency. Dev runs
fine without it (it falls back to OpenFreeMap's hosted dark style), so this is a
one-time setup you do well before race day.

## Bounding box

From the canonical route (`Inaugural_FCTC_.gpx`), padded a little:

```
west  115.790   south -31.935
east  115.821   north -31.905
```

## Steps

1. **Install the `pmtiles` CLI** (Go binary):
   https://github.com/protomaps/go-pmtiles/releases — or `brew install pmtiles`.

2. **Extract the bbox** from the Protomaps daily build straight into the repo:

   ```bash
   pmtiles extract \
     https://build.protomaps.com/20240101.pmtiles \
     public/basemap.pmtiles \
     --bbox=115.790,-31.935,115.821,-31.905 \
     --maxzoom=16
   ```

   (Use the most recent daily build date available. Maxzoom 16 is plenty for a
   2 km view; the file should land well under ~5 MB.)

3. **Turn it on:** create `.env.local` with

   ```
   VITE_USE_PMTILES=true
   ```

   `npm run dev` / `npm run build` now read the local PMTiles and style it with
   `protomaps-themes-base` (dark theme). Tune the theme in `src/map.ts`.

4. **Verify** the lake renders muted and dark, attribution is intact
   (OpenStreetMap · Protomaps), and the file is committed-or-deployed alongside
   `dist/`.

## Fallback

If the extract step is ever a problem, leave `VITE_USE_PMTILES` unset and the app
uses OpenFreeMap's hosted `dark` style (keyless). MapTiler's free tier
(`Dataviz Dark`, needs a domain-restricted key) is the prettier hosted option.
