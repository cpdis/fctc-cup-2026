// Runner colours: bright, saturated, and spaced around the hue wheel so they
// stay distinguishable on the dark basemap. 15 is near the human limit for
// at-a-glance distinctness, so legibility leans on label-on-select (U6) too.
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
];

export function colorFor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
