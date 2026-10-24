// Headless verification against the running dev server (npm run dev).
// Usage: node scripts/check.mjs [outDir] [url]
// Writes screenshots to outDir and exits non-zero if any check fails.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'shots';
const url = process.argv[3] ?? 'http://localhost:5173/';
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()} ${r.url()}`));

await page.goto(url, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
await new Promise((r) => setTimeout(r, 500));

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });

const canvasSize = await page.$eval('canvas', (c) => ({ w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight }));
check('internal resolution 480x270', canvasSize.w === 480 && canvasSize.h === 270, JSON.stringify(canvasSize));
check('integer upscale', canvasSize.cssW % 480 === 0 && canvasSize.cssW / 480 === canvasSize.cssH / 270, JSON.stringify(canvasSize));

await shot('01-default');

// Hover known tiles; the info panel must name the terrain of exactly that tile.
for (const [x, y] of [[16, 16], [6, 7], [26, 26], [6, 25], [26, 6]]) {
  const pos = await page.evaluate((x, y) => window.__map.tileScreenPos(x, y), x, y);
  await page.mouse.move(pos.x, pos.y);
  await new Promise((r) => setTimeout(r, 150));
  const got = await page.evaluate(() => {
    const h = window.__map.hovered();
    return { tile: h && [h.x, h.y, h.terrain], panel: document.querySelector('#tile-info .name')?.textContent, hidden: document.querySelector('#tile-info')?.hidden };
  });
  const expected = await page.evaluate((x, y) => window.__map.tile(x, y).terrain, x, y);
  const ok = got.tile && got.tile[0] === x && got.tile[1] === y && got.tile[2] === expected && !got.hidden && !!got.panel;
  check(`hover tile (${x},${y}) = ${expected}`, ok, JSON.stringify(got));
}
await shot('02-hover');

// Orbit clamp: drag far up and down, polar angle must stay in [25, 75].
const mid = { x: 960, y: 540 };
for (const dy of [2000, -2000]) {
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 300, mid.y + dy, { steps: 20 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const cam = await page.evaluate(() => window.__map.camera());
  check(`polar clamp after drag ${dy}`, cam.polarDeg >= 24.9 && cam.polarDeg <= 75.1, cam.polarDeg.toFixed(2));
}
await shot('03-rotated');

// Zoom clamp both ways.
for (const [dir, name] of [[1, 'out'], [-1, 'in']]) {
  await page.mouse.move(mid.x, mid.y);
  for (let i = 0; i < 40; i++) await page.mouse.wheel({ deltaY: dir * 200 });
  await new Promise((r) => setTimeout(r, 400));
  const cam = await page.evaluate(() => window.__map.camera());
  const limit = dir > 0 ? 0.5 : 3;
  check(`zoom ${name} clamps to ${limit}`, Math.abs(cam.zoom - limit) < 1e-6, String(cam.zoom));
  await shot(`04-zoom-${name}`);
}

// Pan clamp: hold D for a long time, target must stay over the map.
await page.keyboard.down('KeyD');
await new Promise((r) => setTimeout(r, 2500));
await page.keyboard.up('KeyD');
const panned = await page.evaluate(() => window.__map.camera());
check('pan clamps to map', Math.abs(panned.target[0]) <= 16.001 && Math.abs(panned.target[2]) <= 16.001, JSON.stringify(panned.target));

check('no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
