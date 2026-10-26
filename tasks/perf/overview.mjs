// Whole-board overviews of generated maps at a given size (top-down-ish, zoomed out).
// Usage: node tasks/perf/overview.mjs <outDir> <size> <seed...>
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [outDir, size, ...seeds] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--hide-scrollbars'], defaultViewport: { width: 960, height: 540 } });
const page = await browser.newPage();
for (const seed of seeds) {
  await page.goto(`http://localhost:5173/?map=world&seed=${seed}&size=${size}&weather=clear&time=day`);
  await page.waitForFunction(() => window.__map, { timeout: 60000 });
  await page.evaluate(() => document.getElementById('hud')?.setAttribute('hidden', ''));
  await page.evaluate(() => window.__map.setTime(3));
  await page.evaluate((s) => window.__map.setPose(45, 45, 0.5, s / 2, s / 2), Number(size));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: join(outDir, `w${size}-seed${seed}.png`) });
}
await browser.close();
