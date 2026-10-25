// Headless verification against the running dev server (npm run dev).
// Usage: node scripts/check.mjs [outDir] [url]
// Writes screenshots to outDir and exits non-zero if any check fails.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  // The pick must be what you can see: the tile itself, or a taller column in front of it.
  const target = await page.evaluate((x, y) => window.__map.tile(x, y), x, y);
  const exact = got.tile && got.tile[0] === x && got.tile[1] === y && got.tile[2] === expected;
  const occluder = got.tile && (await page.evaluate((x, y) => window.__map.tile(x, y).height, got.tile[0], got.tile[1])) > target.height;
  const ok = (exact || occluder) && !got.hidden && !!got.panel;
  check(`hover tile (${x},${y}) = ${expected}${exact ? '' : ' (occluded by taller tile)'}`, ok, JSON.stringify(got));
}
await shot('02-hover');

// Height-aware picking: from three camera poses, aim at the top of a low tile behind
// the mountain. The pick must be what you can see — that tile, or a taller column in front.
const hoverAt = async (x, y) => {
  const pos = await page.evaluate((x, y) => window.__map.tileScreenPos(x, y), x, y);
  await page.mouse.move(pos.x, pos.y);
  await new Promise((r) => setTimeout(r, 150));
  return page.evaluate(() => {
    const h = window.__map.hovered();
    return h && { x: h.x, y: h.y, height: h.height, terrain: h.terrain };
  });
};
const poses = [
  { name: 'iso', az: 45, polar: 60, zoom: 1.5, target: [12, 12], expectOccluded: false },
  { name: 'low behind peak', az: 45, polar: 75, zoom: 1.5, target: [22, 22], expectOccluded: true },
  { name: 'top-down', az: 45, polar: 25, zoom: 1.5, target: [22, 22], expectOccluded: false },
];
for (const p of poses) {
  await page.evaluate((p) => window.__map.setPose(p.az, p.polar, p.zoom, p.target[0], p.target[1]), p);
  await new Promise((r) => setTimeout(r, 300));
  const [tx, ty] = p.target;
  const target = await page.evaluate((x, y) => window.__map.tile(x, y), tx, ty);
  const got = await hoverAt(tx, ty);
  const isTarget = got && got.x === tx && got.y === ty;
  const ok = p.expectOccluded ? got && !isTarget && got.height > target.height : isTarget;
  check(`pick from pose "${p.name}" at (${tx},${ty})`, !!ok, JSON.stringify({ target: target.terrain, got }));
  if (p.expectOccluded) await shot('02b-occluded');
}
await page.evaluate(() => window.__map.setPose(45, 60, 1, 16, 16));
await new Promise((r) => setTimeout(r, 300));

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

// Animation: flowers exist, the water loop advances with time and wraps, and the picture moves.
const floraCount = await page.evaluate(() => window.__map.floraCount());
check('flowers and tufts placed', floraCount > 100, String(floraCount));
const at = async (seconds) => {
  await page.evaluate((s) => window.__map.setTime(s), seconds);
  await new Promise((r) => setTimeout(r, 300));
  return { frame: await page.evaluate(() => window.__map.waterFrame()), shot: await page.screenshot({ encoding: 'base64' }) };
};
const [t0, tHalf, tLoop] = [await at(0), await at(0.5), await at(2)];
check('water frames advance and loop', t0.frame === 0 && tHalf.frame === 3 && tLoop.frame === 0, JSON.stringify([t0.frame, tHalf.frame, tLoop.frame]));
check('scene moves over time', t0.shot !== tHalf.shot);
await page.evaluate(() => window.__map.setTime(null));

check('no console errors', errors.length === 0, errors.join(' | '));

// Every theme loads cleanly, shows its props and moves over time.
for (const id of await page.evaluate(() => window.__map.themes())) {
  if (id === 'meadow') continue;
  errors.length = 0;
  await page.goto(`${url}?map=${id}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__map);
  const info = await page.evaluate(() => ({ theme: window.__map.theme().id, props: window.__map.propCount() }));
  const [a, b] = [await at(0), await at(0.5)];
  await page.evaluate(() => window.__map.setTime(null));
  await shot(`05-theme-${id}`);
  check(`theme ${id} loads with props and motion`, info.theme === id && info.props > 5 && a.shot !== b.shot && errors.length === 0, JSON.stringify({ ...info, errors }));
}

// Generated maps: the seed shows and reproduces, R grows a new one without leaking GPU
// memory, and maps save to JSON and load back (hook, file picker), refusing bad files.
errors.length = 0;
await page.goto(`${url}?map=world&seed=1234`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
const tilesNow = () => page.evaluate(() => JSON.stringify(JSON.parse(window.__map.exportJson()).tiles));
const first = await tilesNow();
check('world shows its seed', (await page.evaluate(() => window.__map.seed())) === 1234 && (await page.evaluate(() => window.__map.hudText())).includes('#1234'));
await shot('06-world-1234');
const memory = await page.evaluate(() => window.__map.gpuMemory());
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('KeyR');
  await new Promise((r) => setTimeout(r, 300));
}
const regrown = await page.evaluate(() => ({ seed: window.__map.seed(), search: location.search, memory: window.__map.gpuMemory() }));
check('R grows a new map and puts its seed in the URL', regrown.seed !== 1234 && regrown.search === `?map=world&seed=${regrown.seed}` && (await tilesNow()) !== first, JSON.stringify(regrown));
// Maps differ in how many bridges they draw, so compare like with like: back on the first seed, nothing piled up.
await page.evaluate(() => window.__map.newMap(1234));
await new Promise((r) => setTimeout(r, 300));
const returned = await page.evaluate(() => window.__map.gpuMemory());
check('regrowing frees the old map', returned.geometries <= memory.geometries && returned.textures <= memory.textures, JSON.stringify({ before: memory, after: returned }));
await page.click('#hud button');
await new Promise((r) => setTimeout(r, 300));
check('New map button grows another', (await page.evaluate(() => window.__map.seed())) !== regrown.seed);
await page.goto(`${url}?map=world&seed=1234`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
check('the same seed gives the same map', (await tilesNow()) === first);

const saved = JSON.parse(await page.evaluate(() => window.__map.exportJson()));
Object.assign(saved.tiles[0], { terrain: 'peak_snow', height: 8 });
const loadError = await page.evaluate((text) => window.__map.loadJson(text), JSON.stringify(saved));
const loaded = await page.evaluate(() => window.__map.tile(0, 0));
check('an edited JSON map loads', loadError === null && loaded.terrain === 'peak_snow' && loaded.height === 8, JSON.stringify({ loadError, loaded }));
const badError = await page.evaluate(() => window.__map.loadJson('{"version":1}'));
check('a bad file is refused and the map kept', typeof badError === 'string' && (await page.evaluate(() => window.__map.tile(0, 0).terrain)) === 'peak_snow', String(badError));
const file = join(outDir, 'map-file.json');
writeFileSync(file, await page.evaluate(() => window.__map.exportJson()).then((t) => t.replace('"peak_snow"', '"forest"')));
const picker = await page.$('#hud input[type=file]');
await picker.uploadFile(file);
await page.waitForFunction(() => window.__map.tile(0, 0).terrain === 'forest', { timeout: 3000 }).catch(() => {});
check('Load picks a saved file', (await page.evaluate(() => window.__map.tile(0, 0).terrain)) === 'forest' && (await page.evaluate(() => window.__map.hudText())).includes('Loaded'));
const offered = await page.$$eval('#hud select option', (os) => os.map((o) => o.value));
const selected = await page.$eval('#hud select', (s) => s.value);
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.select('#hud select', 'volcano')]);
await page.waitForFunction(() => window.__map);
const picked = await page.evaluate(() => ({ theme: window.__map.theme().id, shown: document.querySelector('#hud select').value }));
check('the map picker offers every map and switches to one', selected === 'world' && offered.includes('world') && offered.length === 8 && picked.theme === 'volcano' && picked.shown === 'volcano', JSON.stringify({ offered, selected, picked }));
// Rivers (M4): bridges can be picked and stand a step above the water; waterfalls exist.
const bridgeCheck = async (where, wanted) => {
  await page.goto(`${url}?map=${where}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__map);
  await page.evaluate(() => (document.getElementById('hud').hidden = true));
  const bridge = await page.evaluate(() => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (window.__map.tile(x, y)?.feature?.startsWith('bridge')) return window.__map.tile(x, y);
    return null;
  });
  await page.evaluate((b) => window.__map.setPose(45, 60, 2.5, b.x, b.y), bridge);
  await new Promise((r) => setTimeout(r, 300));
  const got = await hoverAt(bridge.x, bridge.y);
  const panel = await page.evaluate(() => document.querySelector('#tile-info')?.textContent ?? '');
  check(`${where}: hovering a bridge picks it and names it`, got?.x === bridge.x && got?.y === bridge.y && panel.includes(wanted) && panel.includes(`HT ${bridge.height + 1}`), JSON.stringify({ bridge, got, panel }));
  await page.mouse.move(0, 0);
};
await bridgeCheck('world&seed=7', 'Bridge');
await shot('07-world-bridge');
const falls = await page.evaluate(() => {
  let n = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (window.__map.tile(x, y).water?.kind === 'waterfall') n++;
  return n;
});
check('world: rivers fall over drops as waterfalls', falls > 0, String(falls));
// Cover (M5): trees and rocks stand on generated maps, and the tile panel names them.
const cover = await page.evaluate(() => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (window.__map.tile(x, y).prop === 'broadleaf') return { x, y, count: window.__map.propCount() };
  return null;
});
await page.evaluate((c) => window.__map.setPose(45, 60, 2.5, c.x, c.y), cover);
await new Promise((r) => setTimeout(r, 300));
const onTree = await hoverAt(cover.x, cover.y);
const treePanel = await page.evaluate(() => document.querySelector('#tile-info')?.textContent ?? '');
check('world: trees and rocks stand on the map, and the panel names the cover', cover.count >= 15 && onTree?.x === cover.x && onTree?.y === cover.y && treePanel.includes('Broadleaf Tree'), JSON.stringify({ cover, onTree, treePanel }));
await page.mouse.move(0, 0);
await bridgeCheck('market', 'Wooden Bridge');
check('world: no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
