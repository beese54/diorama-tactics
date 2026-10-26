// Zoomed all the way out on a big board, with and without supersampling: two stills and a
// side-by-side GIF of a slow pan, where shimmer shows. Usage: node tasks/perf/zoomout.mjs <outDir> [size] [seed]
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'zoomout', size = '64', seed = '99'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--hide-scrollbars'], defaultViewport: { width: 960, height: 540 } });
const page = await browser.newPage();
await page.goto(`http://localhost:5173/?map=world&seed=${seed}&size=${size}&weather=clear&time=day`);
await page.waitForFunction(() => window.__map);
await page.evaluate(() => document.getElementById('hud')?.setAttribute('hidden', ''));
await page.evaluate(() => window.__map.setTime(2));
const zoom = await page.evaluate(() => window.__map.minZoom());
const n = Number(size);
const FRAMES = 36;
for (const [label, on] of [['before', false], ['after', true]]) {
  await page.evaluate((on) => window.__map.setSupersampling(on), on);
  await page.evaluate((z, c) => window.__map.setPose(45, 60, z, c, c), zoom, n / 2);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: join(outDir, `whole-${size}-${label}.png`) });
  // A slow diagonal pan, a third of a tile per frame.
  const dir = join(outDir, `pan-${label}`);
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < FRAMES; i++) {
    await page.evaluate((z, x, y) => window.__map.setPose(45, 60, z, x, y), zoom, n / 2 - 6 + i / 3, n / 2 - 6 + i / 3);
    await new Promise((r) => setTimeout(r, 100));
    await page.screenshot({ path: join(dir, `f${String(i).padStart(3, '0')}.png`) });
  }
}
await browser.close();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '12', '-i', join(outDir, 'pan-before', 'f%03d.png'), '-framerate', '12', '-i', join(outDir, 'pan-after', 'f%03d.png'),
  '-filter_complex', '[0][1]hstack,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none', '-loop', '0', join(outDir, `pan-${size}-before-after.gif`)]);
console.log(`zoom ${zoom.toFixed(3)}; wrote ${outDir}`);
