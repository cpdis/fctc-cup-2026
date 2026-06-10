/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to use the self-hosted Protomaps PMTiles basemap. */
  readonly VITE_USE_PMTILES?: string;
  /** Set to "true" for a flat inline basemap (offline/deterministic screenshots). */
  readonly VITE_FLAT_BASEMAP?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'protomaps-themes-base' {
  /** Returns a MapLibre layer array for the given source + theme. */
  const layers: (source: string, theme: string) => unknown[];
  export default layers;
}
