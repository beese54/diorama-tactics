// Pixel identity: captures fixed views with a frozen clock and compares them with a saved set.
// Usage: node tasks/perf/identity.mjs save <dir>      (record the reference)
//        node tasks/perf/identity.mjs compare <dir>   (fail if any pixel differs)
// SwiftShader (CPU) rendering, so the same scene gives the same pixels every run.
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [mode, dir] = process.argv.slice(2);
if (!['save', 'compare'].includes(mode) || !dir) throw new Error('usage: identity.mjs save|compare <dir>');
mkdirSync(dir, { recursive: true });

const CASES = [
  ['meadow', 'map=meadow'],
  ['alpine', 'map=alpine'],
  ['volcano', 'map=volcano'],
  ['market', 'map=market'],
  ['autumn', 'map=autumn'],
  ['autumn-snow', 'map=autumn&weather=snow&time=day'],
  ['desert', 'map=desert'],
  ['frozen', 'map=frozen'],
  ['moor', 'map=moor'],
  ['w32-clear-day', 'map=world&seed=4242&weather=clear&time=day'],
  ['w32-storm-night', 'map=world&seed=4242&weather=storm&time=night'],
  ['w32-snow-dusk', 'map=world&seed=4242&weather=snow&time=dusk'],
  ['w32-seed7-rain-dawn', 'map=world&seed=7&weather=rain&time=dawn'],
  ['w64-clear-day', 'map=world&seed=4242&size=64&weather=clear&time=day'],
  ['w64-seed99-fog-day', 'map=world&seed=99&size=64&weather=fog&time=day'],
];
// [name, azimuth, polar, zoom, x as a share of the width, y as a share]
const POSES = [['iso', 45, 60, 1, 0.5, 0.5], ['close', 135, 50, 2.4, 0.4, 0.6]];

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 },
});
const differ = [];
let count = 0;
for (const [name, query] of CASES) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:5173/?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map, { timeout: 600000, polling: 50 });
  // The water's later frames arrive just after the board; a capture before then would show frame 0.
  await page.waitForFunction(() => window.__map.liquidReady(), { timeout: 600000, polling: 50 });
  await page.evaluate(() => document.getElementById('hud')?.setAttribute('hidden', ''));
  await page.evaluate(() => window.__map.setTime(3));
  await new Promise((r) => setTimeout(r, 800));
  for (const [pose, az, polar, zoom, fx, fy] of POSES) {
    await page.evaluate((az, polar, zoom, fx, fy) => {
      const w = window.__map.theme().width;
      window.__map.setPose(az, polar, zoom, Math.floor(w * fx), Math.floor(w * fy));
    }, az, polar, zoom, fx, fy);
    await new Promise((r) => setTimeout(r, 500));
    const png = await page.screenshot();
    const file = join(dir, `${name}-${pose}.png`);
    count++;
    if (mode === 'save') writeFileSync(file, png);
    else if (!existsSync(file)) differ.push(`${name}-${pose}: no reference`);
    else if (!Buffer.from(png).equals(readFileSync(file))) {
      writeFileSync(join(dir, `${name}-${pose}.new.png`), png);
      differ.push(`${name}-${pose}`);
    }
  }
  await page.close();
}
await browser.close();
if (mode === 'save') console.log(`saved ${count} captures to ${dir}`);
else if (differ.length) (console.log(`DIFFER ${differ.length}/${count}: ${differ.join(', ')}`), process.exit(1));
else console.log(`identical ${count}/${count}`);
