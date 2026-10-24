// Records a looping GIF of the animated map from one camera pose (for reviewing motion on a phone).
// Needs the dev server (npm run dev) and ffmpeg on PATH (or FFMPEG_PATH).
// Usage: node scripts/gif.mjs <out.gif> [azimuth polar zoom tileX tileY] [seconds] [fps]
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out = 'map.gif', az = 45, polar = 60, zoom = 2, x = 16, y = 16, seconds = 4, fps = 12] = process.argv.slice(2);
const url = process.env.MAP_URL ?? 'http://localhost:5173/';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  // 960x540 shows the 480x270 buffer at exactly 2x.
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
await page.evaluate((p) => window.__map.setPose(+p[0], +p[1], +p[2], +p[3], +p[4]), [az, polar, zoom, x, y]);
await new Promise((r) => setTimeout(r, 800));

const dir = mkdtempSync(join(tmpdir(), 'mapgif-'));
const frames = Math.round(seconds * fps);
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.__map.setTime(t), i / fps);
  await new Promise((r) => setTimeout(r, 120));
  await page.screenshot({ path: join(dir, `f${String(i).padStart(3, '0')}.png`) });
}
await browser.close();

// Pixel art: exact palette, no dithering, nearest scaling.
execFileSync(ffmpeg, [
  '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%03d.png'),
  '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none',
  '-loop', '0', out,
]);
rmSync(dir, { recursive: true, force: true });
console.log(`wrote ${out} (${frames} frames at ${fps} fps)`);
