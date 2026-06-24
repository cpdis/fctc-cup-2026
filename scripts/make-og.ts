// Generate the Open Graph / link-preview image (public/og.png, 1200x630) from
// the real baked data: the canonical Herdsman Lake loop, drawn with the field of
// runners as colour-coded dots strung along it, in the site's own type + palette.
// Run with `npm run og` (after `npm run bake`). Deterministic — no randomness.

import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import type { ReplayData } from '../src/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPLAY = resolve(ROOT, 'public/replay.json');
const OUT = resolve(ROOT, 'public/og.png');

const W = 1200;
const H = 630;

// --- loop geometry: project the route into a box on the right ----------------
const BOX = { x: 612, y: 56, w: 540, h: 518 };

function buildSvg(data: ReplayData): string {
  const { lng, lat, count } = data.route;
  const [w, s, e, n] = data.race.bounds;
  const cosLat = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const gw = (e - w) * cosLat;
  const gh = n - s;
  const scale = Math.min(BOX.w / gw, BOX.h / gh);
  const ox = BOX.x + (BOX.w - gw * scale) / 2;
  const oy = BOX.y + (BOX.h - gh * scale) / 2;
  const sx = (i: number): number => ox + (lng[i] - w) * cosLat * scale;
  const sy = (i: number): number => oy + (n - lat[i]) * scale; // north up

  // Subsample the 7740-point loop for a smooth, light path.
  const step = 8;
  let d = `M ${sx(0).toFixed(1)} ${sy(0).toFixed(1)}`;
  for (let i = step; i < count; i += step) d += ` L ${sx(i).toFixed(1)} ${sy(i).toFixed(1)}`;
  d += ' Z';

  // The field: a colour dot per finisher, spread along the loop like a race in
  // motion (leaders near the line, a pack behind, a couple strung out).
  const colors = data.runners.filter((r) => !r.dns).map((r) => r.color);
  const fracs = [
    0.94, 0.81, 0.78, 0.74, 0.69, 0.63, 0.59, 0.55, 0.52, 0.48, 0.44, 0.39, 0.32, 0.23, 0.12,
  ];
  const dots = colors
    .map((color, k) => {
      const f = fracs[k % fracs.length];
      const i = Math.round(f * (count - 1));
      const x = sx(i).toFixed(1);
      const y = sy(i).toFixed(1);
      const lead = k === 0;
      const r = lead ? 8.5 : 6.5;
      return `
        <circle cx="${x}" cy="${y}" r="${r * 2.4}" fill="${color}" opacity="0.20"/>
        <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>
        <circle cx="${x}" cy="${y}" r="${r * 0.4}" fill="#fff" opacity="0.85"/>
        ${lead ? `<circle cx="${x}" cy="${y}" r="${r + 5}" fill="none" stroke="#ffd23f" stroke-width="2" opacity="0.9"/>` : ''}`;
    })
    .join('');

  // Start/finish line marker.
  const startX = sx(0).toFixed(1);
  const startY = sy(0).toFixed(1);

  return `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="${d}" stroke="#f5f3ee" stroke-width="9" opacity="0.08" stroke-linejoin="round"/>
      <path d="${d}" stroke="#f5f3ee" stroke-width="2.5" opacity="0.8" stroke-linejoin="round"/>
      <circle cx="${startX}" cy="${startY}" r="9" fill="none" stroke="#ffd23f" stroke-width="2.5"/>
      ${dots}
    </svg>`;
}

function html(svg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: ${W}px; height: ${H}px; }
    body {
      position: relative; overflow: hidden;
      background:
        radial-gradient(105% 115% at 80% 42%, #15202e 0%, #0c121b 52%, #080b11 100%);
      font-family: 'Space Grotesk', sans-serif; color: #f5f3ee;
    }
    .loop { position: absolute; inset: 0; }
    .stage { position: absolute; inset: 0; padding: 60px 64px; display: flex; flex-direction: column; }
    .eyebrow {
      font-family: 'JetBrains Mono', monospace; font-weight: 600;
      font-size: 16px; letter-spacing: 0.30em; text-transform: uppercase; color: #ffd23f;
    }
    .mark { margin-top: auto; }
    .mark h1 {
      font-weight: 700; font-size: 132px; line-height: 0.92; letter-spacing: 0.005em;
    }
    .rule { width: 132px; height: 4px; background: #ffd23f; border-radius: 2px; margin: 26px 0 22px; }
    .tag {
      font-weight: 500; font-size: 27px; line-height: 1.36; color: #c2cad6; max-width: 560px;
    }
    .tag b { color: #f5f3ee; font-weight: 700; }
    .foot {
      margin-top: auto; display: flex; align-items: center; gap: 16px;
      font-family: 'JetBrains Mono', monospace; font-size: 18px; letter-spacing: 0.04em;
    }
    .foot .meta { color: #7e8a9c; }
    .foot .dot { color: #3a4452; }
    .foot .url { color: #ffd23f; font-weight: 600; }
  </style></head>
  <body>
    <div class="loop">${svg}</div>
    <div class="stage">
      <div class="eyebrow">Filament Coffee Track Club</div>
      <div class="mark">
        <h1>FCTC<br/>CUP</h1>
        <div class="rule"></div>
        <div class="tag">Everyone calls their finish to the second.<br/><b>Closest to their own prediction wins.</b></div>
      </div>
      <div class="foot">
        <span class="meta">Herdsman Lake, Perth · 7.74 km</span>
        <span class="dot">●</span>
        <span class="url">fctc.fun/cup</span>
      </div>
    </div>
  </body></html>`;
}

async function main(): Promise<void> {
  const data = JSON.parse(readFileSync(REPLAY, 'utf8')) as ReplayData;
  const page = await (
    await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    })
  ).newPage();
  // DSF 1 so the PNG is exactly W x H — matches the og:image:width/height we
  // declare in index.html (1200x630, the canonical card size).
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.setContent(html(buildSvg(data)), { waitUntil: 'load', timeout: 30000 });
  // 'load' fires before webfonts finish fetching; wait for them explicitly.
  await page.evaluate(async () => {
    await (document as Document & { fonts: FontFaceSet }).fonts.ready;
  });
  await new Promise((r) => setTimeout(r, 400));
  mkdirSync(dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, type: 'png' });
  await page.browser().close();
  console.log(`Wrote ${OUT} (${W}x${H})`);
}

void main();
