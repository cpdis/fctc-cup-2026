/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to use the self-hosted Protomaps PMTiles basemap. */
  readonly VITE_USE_PMTILES?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'protomaps-themes-base' {
  /** Returns a MapLibre layer array for the given source + theme. */
  const layers: (source: string, theme: string) => unknown[];
  export default layers;
}
