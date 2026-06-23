// Runner colours: bright, saturated, and spaced around the hue wheel so they
// stay distinguishable on the dark basemap. 17 is past the comfortable
// at-a-glance limit, but the 2026 field is 17 runners and every one deserves a
// unique colour, so legibility leans on label-on-select (U6) for the closest
// pairs. The last two (emerald, crimson) fill the widest gaps on the wheel.
export const PALETTE: readonly string[] = [
  '#ff5a36', // vermilion
  '#ffd23f', // gold
  '#3fe0a0', // mint
  '#3fa9ff', // azure
  '#c46bff', // violet
  '#ff6fb5', // pink
  '#9be857', // lime
  '#ff9e3f', // amber
  '#36d6ff', // cyan
  '#f25fff', // magenta
  '#6f86ff', // periwinkle
  '#ffe66d', // straw
  '#43f0c7', // turquoise
  '#ff7a5c', // coral
  '#8d7bff', // indigo
  '#2ee86b', // emerald
  '#ff3355', // crimson
];

export function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
