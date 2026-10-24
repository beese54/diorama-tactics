// Photographs the standard views of the map for the visual history in evolution/.
// Run it at the end of each visual milestone so every version is shot from the same poses.
// Needs the dev server (npm run dev). Views a version lacks the hooks for are skipped.
// Usage: node scripts/snapshot.mjs <outDir> [url]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'snapshot';
const url = process.argv[3] ?? 'http://localhost:5173/';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(outDir, { recursive: true });

// [azimuth, polar, zoom, tileX, tileY] on the 32x32 test map.
const CLOSEUPS = {
  'close-river': [30, 55, 2.6, 12, 9],
  'close-forest': [135, 55, 2.4, 7, 8],
  'close-mountain': [220, 50, 2.2, 25, 24],
};

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  // 960x540 shows the 480x270 buffer at exactly 2x.
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map, { timeout: 5000 }).catch(() => {});
const hooks = await page.evaluate(() => Object.keys(window.__map ?? {}));
const settle = () => new Promise((r) => setTimeout(r, 600));

// Freeze animation so stills are reproducible.
if (hooks.includes('setTime')) await page.evaluate(() => window.__map.setTime(0));
await settle();
const shots = ['overview'];
await page.screenshot({ path: join(outDir, 'overview.png') });

if (hooks.includes('setPose')) {
  for (const [name, pose] of Object.entries(CLOSEUPS)) {
    await page.evaluate((p) => window.__map.setPose(...p), pose);
    await settle();
    await page.screenshot({ path: join(outDir, `${name}.png`) });
    shots.push(name);
  }
}
await browser.close();
console.log(`wrote ${shots.join(', ')} to ${outDir}`);
