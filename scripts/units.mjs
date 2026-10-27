// Photographs units on the map for the visual history in evolution/characters/: the opening
// view, a unit selected with its move range, the path preview, the unit after its move, and
// a close-up, plus walk.gif of the move. Needs the dev server (npm run dev) and ffmpeg.
// Usage: node scripts/units.mjs <outDir> [map ids...]
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outDir, ...ids] = process.argv.slice(2);
if (!outDir) throw new Error('usage: units.mjs <outDir> [map ids...]');
const maps = ids.length ? ids : ['meadow'];
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--hide-scrollbars'],
  // 960x540 shows the 480x270 buffer at exactly 2x.
  defaultViewport: { width: 960, height: 540, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = () => page.waitForFunction(() => !window.__map.busy(), { timeout: 20000, polling: 50 });

for (const id of maps) {
  const dir = join(outDir, id);
  mkdirSync(dir, { recursive: true });
  await page.goto(`http://localhost:5173/?map=${id}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__map?.liquidReady(), { timeout: 60000, polling: 50 });
  await page.evaluate(() => window.__map.setTime(3));
  const { zoom } = await page.evaluate(() => window.__map.theme());
  await page.evaluate((z) => window.__map.setPose(45, 60, z), zoom);
  await settle(600);
  await page.screenshot({ path: join(dir, 'overview.png') });

  // Select the first ally and look at its range.
  const lead = (await page.evaluate(() => window.__map.units()))[0];
  await page.evaluate((x, y) => window.__map.setPose(45, 55, 1.6, x, y), lead.x, lead.y);
  await settle(400);
  let at = await page.evaluate((x, y) => window.__map.tileScreenPos(x, y), lead.x, lead.y);
  await page.mouse.click(at.x, at.y - 6);
  await settle(1200);
  await page.screenshot({ path: join(dir, 'select.png') });

  // Hover the reachable tile nearest the enemy, for the path preview.
  const reach = await page.evaluate(() => window.__map.reachable());
  const target = reach.reduce((a, b) => (b[0] + b[1] < a[0] + a[1] ? b : a));
  at = await page.evaluate((x, y) => window.__map.tileScreenPos(x, y), target[0], target[1]);
  await page.mouse.move(at.x, at.y);
  await settle(500);
  await page.screenshot({ path: join(dir, 'path.png') });

  // Record the walk, a frame every ~70 ms until the unit arrives, then a beat after.
  const frames = mkdtempSync(join(tmpdir(), 'walk-'));
  await page.mouse.click(at.x, at.y);
  let n = 0;
  for (let after = 0; after < 8 && n < 120; n++) {
    await page.screenshot({ path: join(frames, `f${String(n).padStart(3, '0')}.png`) });
    if (!(await page.evaluate(() => window.__map.busy()))) after++;
  }
  execFileSync(process.env.FFMPEG_PATH ?? 'ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', '14', '-i', join(frames, 'f%03d.png'),
    '-vf', 'scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none', '-loop', '0', join(dir, 'walk.gif'),
  ]);
  rmSync(frames, { recursive: true, force: true });
  await idle();
  await settle(900);
  await page.screenshot({ path: join(dir, 'moved.png') });

  await page.evaluate((x, y) => window.__map.setPose(135, 50, 2.6, x, y), target[0], target[1]);
  await page.mouse.move(5, 5);
  await settle(900);
  await page.screenshot({ path: join(dir, 'close.png') });
  console.log(`${id}: shots in ${dir}`);
}
if (errors.length) console.log('page errors:', errors);
await browser.close();
