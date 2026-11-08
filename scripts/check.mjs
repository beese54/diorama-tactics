// Headless verification against the running dev server (npm run dev). The map checks run in
// the map viewer (mode=view); the skirmish checks at the end run with units on the board.
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

await page.goto(`${url}?mode=view`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
await new Promise((r) => setTimeout(r, 500));

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });

const canvasSize = await page.$eval('canvas', (c) => ({ w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight }));
check('internal resolution 480x270', canvasSize.w === 480 && canvasSize.h === 270, JSON.stringify(canvasSize));
check('integer upscale', canvasSize.cssW % 480 === 0 && canvasSize.cssW / 480 === canvasSize.cssH / 270, JSON.stringify(canvasSize));
// A laptop screen is filled edge to edge, no bars, at the whole pixel scale nearest the 1080p one.
await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
await new Promise((r) => setTimeout(r, 300));
const laptopCanvas = await page.$eval('canvas', (c) => { const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, x: r.x, y: r.y, cssW: r.width, cssH: r.height }; });
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await new Promise((r) => setTimeout(r, 300));
check('a laptop screen (1366x768) is filled edge to edge, at 456x256 pixels of 3',
  laptopCanvas.w === 456 && laptopCanvas.h === 256 && laptopCanvas.cssW === 1368 && laptopCanvas.cssH === 768 && laptopCanvas.x <= 0 && laptopCanvas.y <= 0 && laptopCanvas.x + laptopCanvas.cssW >= 1366,
  JSON.stringify(laptopCanvas));

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
/** Waits for the page to draw `n` frames: the map picks the hovered tile and settles the camera in its frame loop,
 * which runs slowly under software rendering (a big themed map takes several hundred milliseconds a frame). */
const frames = (n = 2) => page.evaluate((n) => new Promise((r) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);
const hoverAt = async (x, y) => {
  await frames();
  const pos = await page.evaluate((x, y) => window.__map.tileScreenPos(x, y), x, y);
  await page.mouse.move(pos.x, pos.y);
  await frames();
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
  await page.goto(`${url}?map=${id}&mode=view`, { waitUntil: 'networkidle0' });
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
await page.goto(`${url}?map=world&seed=1234&mode=view`, { waitUntil: 'networkidle0' });
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
// Boards build asynchronously (M9): wait until the last map asked for is the one shown.
const shownAsAsked = () => page.waitForFunction(() => location.search.includes(`seed=${window.__map.seed()}`) && window.__map.seed() !== 1234, { timeout: 10000 }).catch(() => {});
await shownAsAsked();
const regrown = await page.evaluate(() => ({ seed: window.__map.seed(), search: location.search, memory: window.__map.gpuMemory() }));
check('R grows a new map and puts its seed in the URL', regrown.seed !== 1234 && regrown.search === `?map=world&seed=${regrown.seed}&mode=view` && (await tilesNow()) !== first, JSON.stringify(regrown));
// Maps differ in how many bridges they draw, so compare like with like: back on the first seed, nothing piled up.
await page.evaluate(() => window.__map.newMap(1234));
await new Promise((r) => setTimeout(r, 300));
const returned = await page.evaluate(() => window.__map.gpuMemory());
check('regrowing frees the old map', returned.geometries <= memory.geometries && returned.textures <= memory.textures, JSON.stringify({ before: memory, after: returned }));
// The New map button is in the menu: folded out, then clicked.
const seedBefore = await page.evaluate(() => window.__map.seed());
await page.click('#hud .menu-toggle');
await page.click('#hud button[title^="New map"]');
await page.waitForFunction((s) => window.__map.seed() !== s, { timeout: 10000 }, seedBefore).catch(() => {});
check('New map button (in the menu) grows another', (await page.evaluate(() => window.__map.seed())) !== seedBefore);
await page.goto(`${url}?map=world&seed=1234&mode=view`, { waitUntil: 'networkidle0' });
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
// Loading builds the board asynchronously (M9), so allow it time on a slow software renderer.
await page.waitForFunction(() => window.__map.tile(0, 0).terrain === 'forest' && window.__map.hudText().includes('Loaded'), { timeout: 20000 }).catch(() => {});
check('Load picks a saved file', (await page.evaluate(() => window.__map.tile(0, 0).terrain)) === 'forest' && (await page.evaluate(() => window.__map.hudText())).includes('Loaded'));
const offered = await page.$$eval('#hud select:first-of-type option', (os) => os.map((o) => o.value));
const selected = await page.$eval('#hud select', (s) => s.value);
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.select('#hud select', 'volcano')]);
await page.waitForFunction(() => window.__map);
const picked = await page.evaluate(() => ({ theme: window.__map.theme().id, shown: document.querySelector('#hud select').value }));
const themeCount = await page.evaluate(() => window.__map.themes().length);
check('the map picker offers every map and switches to one', selected === 'world' && offered.includes('world') && offered.length === themeCount + 1 && picked.theme === 'volcano' && picked.shown === 'volcano', JSON.stringify({ offered, selected, picked }));
// Big boards (M9): ?size= grows Wild Lands bigger; the size picker regrows the same seed in place,
// R keeps the size, the standard size leaves the URL clean, and switching sizes frees the old board.
errors.length = 0;
await page.goto(`${url}?map=world&seed=4242&size=64&mode=view`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map, { timeout: 30000 });
const big = await page.evaluate(() => ({ width: window.__map.theme().width, picker: document.querySelector('#hud select:nth-of-type(5)')?.value, corner: window.__map.tile(63, 63)?.terrain }));
await shot('11-board-64');
check('a 64×64 board loads, and the size picker shows it', big.width === 64 && big.picker === '64' && !!big.corner, JSON.stringify(big));
const bigMemory = await page.evaluate(() => window.__map.gpuMemory());
await page.select('#hud select:nth-of-type(5)', '48');
// Regrowing a big board takes several seconds on the software renderer, more when the machine is busy.
await page.waitForFunction(() => window.__map.theme().width === 48, { timeout: 30000 }).catch(() => {});
const resized = await page.evaluate(() => ({ width: window.__map.theme().width, seed: window.__map.seed(), search: location.search }));
check('the size picker regrows the same seed at 48×48', resized.width === 48 && resized.seed === 4242 && resized.search.includes('size=48'), JSON.stringify(resized));
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__map.seed() !== 4242, { timeout: 30000 }).catch(() => {});
check('R keeps the board size', (await page.evaluate(() => window.__map.theme().width)) === 48);
await page.evaluate(() => window.__map.setSize(32));
const standardSize = await page.evaluate(() => ({ width: window.__map.theme().width, search: location.search }));
check('the standard size leaves size out of the URL', standardSize.width === 32 && !standardSize.search.includes('size='), JSON.stringify(standardSize));
await page.evaluate(() => window.__map.setSize(64));
await page.evaluate(() => window.__map.newMap(4242));
const bigAgain = await page.evaluate(() => window.__map.gpuMemory());
check('switching sizes frees the old board', bigAgain.geometries <= bigMemory.geometries && bigAgain.textures <= bigMemory.textures, JSON.stringify({ before: bigMemory, after: bigAgain }));
check('big boards: no console errors', errors.length === 0, errors.join(' | '));

// Rivers (M4): bridges can be picked and stand a step above the water; waterfalls exist.
const bridgeCheck = async (where, wanted) => {
  await page.goto(`${url}?map=${where}&mode=view`, { waitUntil: 'networkidle0' });
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
// Settlements (M6): a village's rooftops can be picked and stood on.
await page.goto(`${url}?map=world&seed=19&mode=view`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
await page.evaluate(() => (document.getElementById('hud').hidden = true));
const roof = await page.evaluate(() => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (window.__map.tile(x, y).terrain.startsWith('house_')) return window.__map.tile(x, y);
  return null;
});
await page.evaluate((r) => window.__map.setPose(45, 60, 2.5, r.x, r.y), roof);
await new Promise((r) => setTimeout(r, 300));
const onRoof = await hoverAt(roof.x, roof.y);
const roofPanel = await page.evaluate(() => document.querySelector('#tile-info')?.textContent ?? '');
check('world: a village rooftop can be picked, and the panel names it', onRoof?.x === roof.x && onRoof?.y === roof.y && /Roof/.test(roofPanel) && roofPanel.includes(`HT ${roof.height}`) && !roofPanel.includes('BLOCKED'), JSON.stringify({ roof, onRoof, roofPanel }));
await shot('08-world-village');
await page.mouse.move(0, 0);
await bridgeCheck('market', 'Wooden Bridge');

// Weather (M7): every weather draws without errors and changes the picture; storms flash;
// the picker switches it; changing maps in the rain doesn't pile up GPU memory.
errors.length = 0;
await page.goto(`${url}?map=world&seed=7&mode=view`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
await page.evaluate(() => (document.getElementById('hud').hidden = true));
const frameAt = async (kind, t) => {
  await page.evaluate((k, time) => (window.__map.setWeather(k, true), window.__map.setTime(time)), kind, t);
  await new Promise((r) => setTimeout(r, 250));
  return (await page.screenshot({ encoding: 'base64' })).toString();
};
const clearFrame = await frameAt('clear', 1);
for (const kind of ['rain', 'storm', 'snow', 'fog']) {
  const frame = await frameAt(kind, 1);
  await shot(`09-weather-${kind}`);
  const look = await page.evaluate(() => window.__map.weather());
  check(`weather ${kind} draws and changes the picture`, frame !== clearFrame && look.kind === kind, JSON.stringify({ kind: look.kind }));
}
await frameAt('storm', 0.5);
const dark = await page.evaluate(() => window.__map.weather().skyLight);
await frameAt('storm', 1.12);
const flash = await page.evaluate(() => window.__map.weather().skyLight);
check('a storm flashes lightning', flash > dark + 1, JSON.stringify({ dark, flash }));
await page.evaluate(() => (document.getElementById('hud').hidden = false));
await page.select('#hud select:nth-of-type(3)', 'snow');
await new Promise((r) => setTimeout(r, 200));
const pickedWeather = await page.evaluate(() => ({ kind: window.__map.weather().kind, search: location.search }));
check('the weather picker switches the weather and keeps it in the URL', pickedWeather.kind === 'snow' && pickedWeather.search.includes('weather=snow'), JSON.stringify(pickedWeather));
await page.evaluate(() => window.__map.setWeather('rain', true));
const wetMemory = await page.evaluate(() => window.__map.gpuMemory());
for (let i = 0; i < 3; i++) await page.evaluate((s) => window.__map.newMap(s), 100 + i);
await page.evaluate(() => window.__map.newMap(7));
await new Promise((r) => setTimeout(r, 300));
const wetAfter = await page.evaluate(() => window.__map.gpuMemory());
check('changing maps in the rain frees the old weather', wetAfter.geometries <= wetMemory.geometries && wetAfter.textures <= wetMemory.textures, JSON.stringify({ before: wetMemory, after: wetAfter }));
check('weather: no console errors', errors.length === 0, errors.join(' | '));

// Day and night (M8): every time draws and differs; shadows are on by day and fainter by moonlight;
// windows glow and fireflies come out at night; the picker and the cycle move the clock.
errors.length = 0;
await page.goto(`${url}?map=world&seed=19&weather=clear&mode=view`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map);
await page.evaluate(() => (document.getElementById('hud').hidden = true));
const atTime = async (choice) => {
  await page.evaluate((c) => (window.__map.setTimeOfDay(c, true), window.__map.setTime(1)), choice);
  await new Promise((r) => setTimeout(r, 250));
  return { frame: (await page.screenshot({ encoding: 'base64' })).toString(), light: await page.evaluate(() => window.__map.daylight()) };
};
const noon = await atTime('day');
check('day: the sun casts shadows', noon.light.shadows && noon.light.shadow > 0.5 && noon.light.night === 0, JSON.stringify(noon.light));
for (const choice of ['dawn', 'dusk', 'night']) {
  const at = await atTime(choice);
  await shot(`10-time-${choice}`);
  check(`time ${choice} draws and differs from day`, at.frame !== noon.frame && at.light.choice === choice, JSON.stringify(at.light));
}
const night = await atTime('night');
check('night: dark, faint moon shadows, windows lit, fireflies out', night.light.night === 1 && night.light.sky < noon.light.sky * 0.5 && night.light.shadow < noon.light.shadow && night.light.fireflies > 0, JSON.stringify(night.light));
await page.evaluate(() => (window.__map.setTimeOfDay('cycle', true), window.__map.setTime(0)));
await new Promise((r) => setTimeout(r, 200));
const cycleA = await page.evaluate(() => window.__map.daylight().sunAt);
await page.evaluate(() => window.__map.setTime(30));
await new Promise((r) => setTimeout(r, 200));
const cycleB = await page.evaluate(() => window.__map.daylight().sunAt);
check('the day-night cycle moves the sun', JSON.stringify(cycleA) !== JSON.stringify(cycleB), JSON.stringify({ cycleA, cycleB }));
await page.evaluate(() => (document.getElementById('hud').hidden = false));
await page.select('#hud select:nth-of-type(4)', 'dusk');
await new Promise((r) => setTimeout(r, 200));
const pickedTime = await page.evaluate(() => ({ choice: window.__map.daylight().choice, search: location.search }));
check('the time picker switches the time and keeps it in the URL', pickedTime.choice === 'dusk' && pickedTime.search.includes('time=dusk'), JSON.stringify(pickedTime));
check('day and night: no console errors', errors.length === 0, errors.join(' | '));
check('world: no console errors', errors.length === 0, errors.join(' | '));

// Skirmish: units deploy and the turn opens on the hand; nobody moves without a card, and the
// card played sets the pool to its MOV (X takes it back before a move). A click selects a unit and
// marks exactly the rules' range, a click on a marked tile walks it there and spends the pool, it
// can't move twice, the card is fixed once a unit has moved, and Enter ends the turn: the foes play
// a card and hold for a moment, taking no orders, then the next turn opens on the hand, where a
// used card can't be played again.
errors.length = 0;
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
const army = await page.evaluate(() => window.__map.units());
check('skirmish: five a side on the board', army.filter((u) => u.side === 'player').length === 5 && army.filter((u) => u.side === 'enemy').length === 5, JSON.stringify(army));
const clickTile = async (x, y) => {
  await page.evaluate((x, y) => window.__map.setPose(45, 55, 1.6, x, y), x, y);
  await frames();
  // Where a click picks that tile: its centre, or up the figure standing there if one in front covers it.
  const pos = await page.evaluate((x, y) => window.__map.aimAt(x, y), x, y);
  await page.mouse.click(pos.x, pos.y);
  await frames();
};
/** Clicks the `i`th card of the hand on screen, at a point on it no other card covers. */
const clickCard = async (i) => {
  const pos = await page.evaluate((i) => window.__map.hand().view.aims[i], i);
  await page.mouse.click(pos.x, pos.y);
  await frames();
};
const turnNow = () => page.evaluate(() => window.__map.turn());
const handNow = () => page.evaluate(() => window.__map.hand());
/** The animated hand on screen: its canvas, focus, clips, flips and the foes' card. */
const handView = () => page.evaluate(() => window.__map.hand().view);
/**
 * Plays the foes' turn out (B7): through any battle of theirs (Space to the result, Space to go
 * on) until the player's hand is back, or the skirmish has ended. Waits on the game, not the clock.
 */
const untilPlayerTurn = async () => {
  for (let i = 0; i < 600; i++) {
    const s = await page.evaluate(() => ({
      side: window.__map.turn().side, open: window.__map.hand().open, battling: window.__map.battling(), ready: !!window.__battle?.ready, ended: !!window.__map.result(),
    }));
    if (s.ended || (s.side === 'player' && s.open && !s.battling)) return;
    if (s.battling && s.ready) {
      await page.keyboard.press('Space');
      await frames(3);
      await page.keyboard.press('Space');
    }
    await frames(3);
  }
  throw new Error("the foes' turn never passed back");
};
const dealt = { turn: await turnNow(), hand: await handNow(), shown: await page.evaluate(() => document.querySelectorAll('#card-hand .card:not(.spot)').length) };
check('cards: the turn opens on a hand of 8, with no card in play and nothing to move with',
  dealt.hand.open && dealt.shown === 8 && dealt.hand.cards.every((c) => !c.used) && dealt.turn.card === null && dealt.turn.pool === 0, JSON.stringify(dealt));
await shot('12a-cards-hand');
// The hand is the animated cards, drawn on a canvas of their own at full device resolution.
await page.waitForFunction(() => window.__map.hand().view.drawing, { timeout: 10000 }).catch(() => {});
const view0 = await handView();
const dpr = await page.evaluate(() => devicePixelRatio);
check('hand: the cards draw on their own canvas, at full device resolution', view0.open && view0.drawing && view0.canvas.width === Math.round(view0.canvas.css * dpr), JSON.stringify({ dpr, canvas: view0.canvas }));
// At rest the cards lie tucked along the bottom, only their tops showing, and the board is clear.
const stageFilter = () => page.evaluate(() => getComputedStyle(document.getElementById('stage')).filter);
const tuckedAt = { browsing: view0.browsing, top: view0.top, filter: await stageFilter() };
check('hand: at rest the cards lie tucked, only their tops showing (the bottom 12%), and the board is clear',
  !tuckedAt.browsing && tuckedAt.top >= 1080 * 0.87 && tuckedAt.filter === 'none', JSON.stringify(tuckedAt));
// Pointing at a card brings the hand into focus and the card up, and plays its clip; the one before stops.
await page.mouse.move(view0.aims[3].x, view0.aims[3].y);
await page.waitForFunction(() => { const v = window.__map.hand().view; return v.focused === 3 && v.playing[3]; }, { timeout: 15000 }).catch(() => {});
const focus3 = await handView();
await new Promise((r) => setTimeout(r, 400)); // the blur eases in
const focusLook = { browsing: focus3.browsing, focusedHeight: focus3.focusedHeight, filter: await stageFilter() };
check('hand: pointing at it brings it into focus: the board blurs and dims, and the card lifts to the middle, over half the screen high',
  focusLook.browsing && focusLook.focusedHeight >= 1080 * 0.55 && /blur/.test(focusLook.filter), JSON.stringify(focusLook));
await page.mouse.move(focus3.aims[5].x, focus3.aims[5].y);
await page.waitForFunction(() => { const v = window.__map.hand().view; return v.focused === 5 && v.playing[5] && !v.playing[3]; }, { timeout: 15000 }).catch(() => {});
const focus5 = await handView();
check('hand: pointing at a card brings it up and plays its clip, and the card before stops',
  focus3.focused === 3 && focus3.playing[3] && focus5.focused === 5 && focus5.playing[5] && focus5.playing.filter(Boolean).length === 1,
  JSON.stringify({ focus3: [focus3.focused, focus3.playing], focus5: [focus5.focused, focus5.playing] }));
await shot('12d-hand-focus');
// F turns the focused card over, and F again turns it back.
await page.keyboard.press('KeyF');
await frames(40);
const handFlipped = (await handView()).flipped;
await shot('12e-hand-flip');
await page.keyboard.press('KeyF');
await frames(40);
const handUnflipped = (await handView()).flipped;
check('hand: F turns the focused card over, and F again turns it back',
  handFlipped[5] && handFlipped.filter(Boolean).length === 1 && handUnflipped.every((f) => !f), JSON.stringify({ handFlipped, handUnflipped }));
await page.mouse.move(5, 540);
// Off the hand, it tucks back down after a moment and the board comes clear.
await page.waitForFunction(() => !window.__map.hand().view.browsing, { timeout: 5000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 400)); // the blur eases out
const leftLook = { browsing: (await handView()).browsing, top: (await handView()).top, filter: await stageFilter() };
check('hand: with the pointer off it, the hand tucks back down and the board comes clear',
  !leftLook.browsing && leftLook.top >= 1080 * 0.87 && leftLook.filter === 'none', JSON.stringify(leftLook));
const mover = army[0];
// Pointing at a unit's figure (its head, well above its tile) points at that unit, in a crowd too:
// the cursor takes its tile, the pointer floats over its head, and its window floats beside it.
const headOf = (u) => page.evaluate((u) => { const p = window.__map.tileScreenPos(u.x, u.y); return { x: p.x, y: p.y - 64 }; }, u);
const pointedAt = [];
const crowd = army.filter((u) => u.side === 'player');
for (const u of crowd) {
  const head = await headOf(u);
  await page.mouse.move(head.x, head.y);
  await new Promise((r) => setTimeout(r, 250));
  pointedAt.push(await page.evaluate((u, head) => {
    const t = window.__map.hovered();
    const el = document.getElementById('unit-info');
    const r = el.getBoundingClientRect();
    const covers = head.x >= r.left && head.x <= r.right && head.y >= r.top && head.y <= r.bottom;
    return { name: u.name, on: !!t && t.x === u.x && t.y === u.y, lift: +window.__map.cursorHeight().toFixed(2), window: !el.hidden && el.classList.contains('floating'), named: el.querySelector('.name')?.textContent === u.name, covers };
  }, u, head));
}
check("units: pointing at a unit's head, above its tile, points at that unit, for each of the army in its starting crowd",
  pointedAt.length === crowd.length && pointedAt.every((p) => p.on), JSON.stringify(pointedAt.map((p) => [p.name, p.on])));
check("units: over a unit, the cursor's pointer floats above its head", pointedAt.every((p) => p.lift > 1.4), JSON.stringify(pointedAt.map((p) => [p.name, p.lift])));
check('units: a unit pointed at shows its window beside it, with its name, clear of its head',
  pointedAt.every((p) => p.window && p.named && !p.covers), JSON.stringify(pointedAt));
const ariaHead = await headOf(crowd.find((u) => u.name === 'Aria') ?? mover);
await page.mouse.move(ariaHead.x, ariaHead.y);
const portrait = await page.waitForFunction(() => { const img = document.querySelector('#unit-info .portrait'); return img?.complete && img.naturalWidth > 0 && img.naturalWidth; }, { timeout: 5000 }).then((h) => h.jsonValue()).catch(() => 0);
check("units: the window shows the hero's portrait", portrait > 0, `naturalWidth ${portrait}`);
await page.mouse.move(5, 540);
await page.keyboard.press('KeyC');
await clickTile(mover.x, mover.y);
const cardless = await page.evaluate(() => ({ selected: window.__map.selected(), marked: window.__map.marked() }));
check('cards: without a card a unit can be picked but goes nowhere', cardless.selected === mover.id && cardless.marked.reach === 0, JSON.stringify(cardless));
// A click on a unit's head, above its tile, selects that unit, not whoever stands behind it.
const other = crowd.find((u) => u.id !== mover.id);
const otherHead = await headOf(other);
await page.mouse.click(otherHead.x, otherHead.y);
const headPicked = await page.evaluate(() => window.__map.selected());
check("units: a click on a unit's head selects that unit", headPicked === other.id, JSON.stringify({ want: other.id, got: headPicked }));
await clickTile(mover.x, mover.y);
// Put away, the cards sink off the screen, and their canvas stops drawing and gets out of the way.
await page.waitForFunction(() => !window.__map.hand().view.drawing, { timeout: 5000 }).catch(() => {});
const closedView = { view: await handView(), hidden: await page.evaluate(() => document.getElementById('card-hand').hidden) };
check('hand: closed, the cards are put away and their canvas stops drawing', !closedView.view.open && !closedView.view.drawing && closedView.hidden, JSON.stringify(closedView));
await page.keyboard.press('KeyX');
await page.keyboard.press('KeyC');
await clickCard(2);
const third = dealt.hand.cards[2];
const played = { turn: await turnNow(), hand: await handNow() };
check("cards: playing a card sets the pool to its MOV and uses it up",
  played.turn.card?.id === third.id && played.turn.pool === third.mov && !played.hand.open && played.hand.cards[2].used, JSON.stringify(played));
await page.keyboard.press('KeyX');
const takenBack = { turn: await turnNow(), hand: await handNow() };
check('cards: X takes the card back before anyone moves', takenBack.turn.card === null && takenBack.turn.pool === 0 && takenBack.hand.open && !takenBack.hand.cards[2].used, JSON.stringify(takenBack));
await clickCard(0);
await clickTile(mover.x, mover.y);
const marks = await page.evaluate(() => ({ selected: window.__map.selected(), marked: window.__map.marked() }));
check('skirmish: a click selects the unit and marks exactly its range', marks.selected === mover.id && marks.marked.reach > 1 && marks.marked.reach === marks.marked.rules, JSON.stringify(marks));
await shot('12-skirmish-select');
const reach = await page.evaluate(() => window.__map.reachable());
// With nothing selected there is nowhere to go: aim at the unit's own tile, so the walk check
// below fails with its details instead of the whole run stopping here.
const goal = reach.length ? reach.reduce((a, b) => (b[0] + b[1] < a[0] + a[1] ? b : a)) : [mover.x, mover.y];
// Pointed at, the path's last tile says what the move costs and what the pool keeps after it.
await page.evaluate((x, y) => window.__map.setPose(45, 55, 1.6, x, y), goal[0], goal[1]);
await frames();
const goalAim = await page.evaluate((x, y) => window.__map.aimAt(x, y), goal[0], goal[1]);
await page.mouse.move(goalAim.x, goalAim.y);
await frames(3);
const costLabel = await page.evaluate(() => window.__map.pathCost());
const pathTiles = await page.evaluate(() => window.__map.marked().path);
// The walk waits on CONFIRM or UNDO beside the mover.
const walkTo = async () => {
  await clickTile(goal[0], goal[1]);
  await page.waitForFunction(() => !window.__map.busy() && !!window.__map.pendingMove(), { timeout: 20000 }).catch(() => {});
  return page.evaluate(() => ({ units: window.__map.units(), turn: window.__map.turn(), pending: window.__map.pendingMove() }));
};
const walked = await walkTo();
const there = walked.units.find((u) => u.id === mover.id);
check('skirmish: a click on a marked tile walks there and spends the pool, then CONFIRM and UNDO show by the unit',
  there.x === goal[0] && there.y === goal[1] && walked.turn.pool < walked.turn.card.mov && walked.pending?.id === mover.id && !!walked.pending?.aims,
  JSON.stringify({ goal, there, turn: walked.turn, pending: walked.pending }));
await shot('13-skirmish-confirm');
const spent = walked.turn.card.mov - walked.turn.pool;
check('skirmish: every tile costs 1 MOV: the path preview says the tiles walked and what is left, and the walk spends exactly that',
  costLabel === `-${spent} MOV${walked.turn.pool} LEFT` && spent === pathTiles - 1, JSON.stringify({ costLabel, spent, pathTiles, pool: walked.turn.pool }));
// UNDO walks it back: the MOV comes back, it may move again, and it is selected with its reach.
const undoAt = walked.pending?.aims?.undo;
if (undoAt) await page.mouse.click(undoAt.x, undoAt.y);
await page.waitForFunction(() => !window.__map.busy() && !window.__map.pendingMove() && window.__map.selected(), { timeout: 20000 }).catch(() => {});
const undone = await page.evaluate(() => ({ units: window.__map.units(), turn: window.__map.turn(), selected: window.__map.selected(), marked: window.__map.marked() }));
const wentBack = undone.units.find((u) => u.id === mover.id);
check('skirmish: UNDO walks the unit back, refunds the MOV, and shows its reach again',
  wentBack.x === mover.x && wentBack.y === mover.y && undone.turn.pool === undone.turn.card.mov && undone.turn.moved.length === 0 && undone.selected === mover.id && undone.marked.reach === undone.marked.rules && undone.marked.reach > 1,
  JSON.stringify({ wentBack, from: [mover.x, mover.y], turn: undone.turn, selected: undone.selected, marked: undone.marked }));
// Again, and CONFIRM keeps it, once the camera has eased back over the unit (else the aim lands
// on a tile the moving camera has since slid away from).
for (let i = 0, last = null; i < 60; i++) {
  const m = JSON.stringify((await page.evaluate(() => window.__map.camera())).matrix);
  if (m === last) break;
  last = m;
  await frames(5);
}
const walkedAgain = await walkTo();
const confirmAt = walkedAgain.pending?.aims?.confirm;
if (confirmAt) await page.mouse.click(confirmAt.x, confirmAt.y);
await frames(2);
const after = await page.evaluate(() => ({ units: window.__map.units(), turn: window.__map.turn(), pending: window.__map.pendingMove() }));
const moved = after.units.find((u) => u.id === mover.id);
check('skirmish: CONFIRM keeps the move: the box goes, the unit stays and has moved',
  moved.x === goal[0] && moved.y === goal[1] && after.pending === null && after.turn.moved.includes(mover.id) && after.turn.pool === walked.turn.pool,
  JSON.stringify({ goal, moved, turn: after.turn, pending: after.pending }));
await shot('13-skirmish-moved');
await clickTile(moved.x, moved.y);
check('skirmish: a unit that has moved gets no range', (await page.evaluate(() => window.__map.marked().reach)) === 0);
await page.keyboard.press('KeyX');
await page.keyboard.press('KeyC');
await clickCard(1);
const fixed = { turn: await turnNow(), hand: await handNow() };
check('cards: once a unit has moved the card stays, and the hand is there to look at only',
  fixed.turn.card?.id === dealt.hand.cards[0].id && fixed.hand.open && !fixed.hand.cards[1].used, JSON.stringify(fixed));
await page.keyboard.press('KeyC');
const turnBox = () => page.evaluate(() => { const el = document.getElementById('turn-info'); return { cls: el.className, text: el.textContent }; });
const foesBefore = (await handNow()).foesLeft;
const foesBeforeTurn = await page.evaluate(() => window.__map.units().filter((u) => u.side === 'enemy'));
await page.keyboard.press('Enter');
await frames(3);
const foesTurn = { turn: await turnNow(), hand: await handNow(), box: await turnBox() };
check("turns: Enter passes to the foes, who play a card (one fewer in their hand), and the box turns red with it",
  foesTurn.turn.side === 'enemy' && foesTurn.turn.number === 1 && !!foesTurn.turn.card && foesTurn.hand.foesLeft === foesBefore - 1 && !foesTurn.hand.open &&
  foesTurn.box.cls === 'enemy' && foesTurn.box.text.includes('FOES') && foesTurn.box.text.includes(foesTurn.turn.card.name.toUpperCase()),
  JSON.stringify({ foesBefore, ...foesTurn }));
// The foes' turn lasts 2.6 s: what it checks is watched from inside the page as it plays, so a
// slow machine (or a slow screenshot) can't let the turn run out before the check looks.
await page.evaluate(() => {
  const log = (window.__foeLog = []);
  const watch = () => {
    const f = window.__map.hand().view.foe;
    if (f) log.push(f);
    if (window.__map.turn().side === 'enemy') requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
});
// On the foes' turn the board takes no orders: C and Enter change nothing.
await page.keyboard.press('KeyC');
await page.keyboard.press('Enter');
await frames(3);
const ignored = { turn: await turnNow(), hand: await handNow() };
check("turns: on the foes' turn the board takes no orders", ignored.turn.side === 'enemy' && ignored.turn.number === 1 && !ignored.hand.open, JSON.stringify(ignored));
// Their card slides in face down, on the foes' crimson stock, and turns face up.
await page.waitForFunction(() => window.__foeLog.some((f) => f.faceUp) || window.__map.turn().side === 'player', { timeout: 10000 }).catch(() => {});
await shot('12c-foes-turn');
const foeCard = await page.evaluate(() => window.__foeLog.find((f) => f.faceUp) ?? window.__foeLog.at(-1) ?? null);
check("turns: the foes' card shows on their crimson stock and turns face up", foeCard?.id === foesTurn.turn.card.id && foeCard.side === 'enemy' && foeCard.faceUp, JSON.stringify(foeCard));
await untilPlayerTurn();
// The foes' turn is the AI's now (B7): their card, then moves on the shared pool to tiles they
// could reach, nobody sharing a tile; then the turn passes back.
const foesAfterTurn = await page.evaluate(() => window.__map.units().filter((u) => u.side === 'enemy'));
const livingSpots = await page.evaluate(() => window.__map.units().filter((u) => u.morale > 0).map((u) => `${u.x},${u.y}`));
const movedFoes = foesAfterTurn.filter((u) => { const b = foesBeforeTurn.find((o) => o.id === u.id); return b.x !== u.x || b.y !== u.y; });
const foesOnTiles = await page.evaluate((fs) => fs.every((u) => !!window.__map.tile(u.x, u.y)), foesAfterTurn);
check("turns: the foes play their turn by the AI (their card, then moves on the shared pool), then pass back",
  movedFoes.length > 0 && foesOnTiles && new Set(livingSpots).size === livingSpots.length, JSON.stringify({ moved: movedFoes.map((u) => [u.name, u.x, u.y]) }));
await frames(3);
const turn2 = await turnNow();
check("turns: back on the player's turn, the foes' card is gone", (await handView()).foe === null, JSON.stringify((await handView()).foe));
await clickCard(0);
const usedAgain = { turn: await turnNow(), hand: await handNow() };
check('cards: Enter ends the turn, and the next opens on the hand with the used card greyed and out of play',
  turn2.number === 2 && turn2.side === 'player' && turn2.card === null && turn2.moved.length === 0 &&
  usedAgain.hand.open && usedAgain.turn.card === null && (await page.evaluate(() => document.querySelectorAll('#card-hand .card')[0].classList.contains('used'))),
  JSON.stringify({ turn2, usedAgain }));
await shot('12b-cards-later');
await clickCard(1);
const turn2b = await turnNow();
check('skirmish: a new card, a fresh pool', turn2b.card?.id === dealt.hand.cards[1].id && turn2b.pool === turn2b.card.mov, JSON.stringify(turn2b));
// Where a foe stands now: the foes have moved on their turn.
const foe = (await page.evaluate(() => window.__map.units())).find((u) => u.side === 'enemy' && u.morale > 0);
await clickTile(foe.x, foe.y);
const foeMarks = await page.evaluate(() => window.__map.marked());
check('skirmish: a foe shows its reach in red and cannot be moved', foeMarks.foe > 1 && foeMarks.reach === 0, JSON.stringify(foeMarks));
check('skirmish: no console errors', errors.length === 0, errors.join(' | '));

// The battle scene: the rules decide, the scene plays it to the same end; Space skips to it.
errors.length = 0;
const battleHud = () => page.evaluate(() => [...document.querySelectorAll('#battle-hud .banner')].map((b) => ({
  morale: Number(b.querySelector('.value').textContent),
  standing: b.querySelectorAll('.troops i.up').length,
})).concat([{ loss: document.querySelector('#battle-hud .loss:not([hidden])')?.textContent ?? null }]));
const battleUrl = `${url}?mode=battle&a=sword&d=axe&seed=7`;
await page.goto(battleUrl, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
const rules = await page.evaluate(() => window.__battle.rules());
await page.evaluate(() => window.__battle.at(0.4));
const opening = await battleHud();
await page.evaluate(() => window.__battle.at(window.__battle.length() + 0.5));
const ending = await battleHud();
// The banners: the attacker's on the left, the defender's on the right.
const [lw, ld] = rules.winner === 'attacker' ? [0, 1] : [1, 0];
const lostMorale = rules.morale[rules.winner === 'attacker' ? 'defender' : 'attacker'] - rules.damage;
check("battle: the scene plays to the rules' result (the loser wiped out, its Morale down by the damage)",
  opening[0].standing === 8 && opening[1].standing === 8 && ending[ld].standing === 0 && ending[lw].standing > 0 && ending[ld].morale === lostMorale && ending[2].loss === `−${rules.damage}`,
  JSON.stringify({ rules, opening, ending }));
await shot('14-battle-result');
await page.goto(battleUrl, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
await page.keyboard.press('Space');
await frames(3);
const skipped = await battleHud();
check('battle: Space skips to the result', skipped[ld].standing === 0 && skipped[ld].morale === lostMorale, JSON.stringify(skipped));
// Stance: A, S and D set the player's from the next beat. The edge shown moves with it at once, and
// the skill gauge charges by the stance (2026-11-08): fast when passive, half that when neutral, and
// it drains when aggressive.
const player = () => page.evaluate(() => {
  const b = document.querySelector('#battle-hud .banner.ally');
  return { edge: b.querySelector('.edge').textContent, stance: b.querySelector('.stance b.on').dataset.stance, gauge: Number(b.querySelector('.skill .value').textContent) };
});
// Opened still (&at=), so no beat is fought before the key.
const stanceRun = async (key) => {
  await page.goto(`${battleUrl}&at=0.4`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
  const before = await player();
  await page.keyboard.press(key);
  const pressed = await player();
  await page.evaluate(() => window.__battle.at(window.__battle.length() + 0.5));
  return { before, pressed, after: await player() };
};
const runs = { A: await stanceRun('KeyA'), S: await stanceRun('KeyS'), D: await stanceRun('KeyD') };
const edgeOf = (text) => Number(text.replace('EDGE ', '').replace('−', '-'));
check('battle: A, S and D set the stance, and the edge shown moves by its 2',
  runs.A.pressed.stance === 'aggressive' && runs.S.pressed.stance === 'neutral' && runs.D.pressed.stance === 'passive' &&
  edgeOf(runs.A.pressed.edge) === edgeOf(runs.A.before.edge) + 2 && edgeOf(runs.S.pressed.edge) === edgeOf(runs.S.before.edge) &&
  edgeOf(runs.D.pressed.edge) === edgeOf(runs.D.before.edge) - 2,
  JSON.stringify(runs));
check('battle: the skill gauge charges fast when passive, half as fast when neutral, and not at all (it drains) when aggressive',
  runs.A.before.gauge === 0 && runs.D.after.gauge > 0 && runs.S.after.gauge === Math.min(100, runs.D.after.gauge / 2) && runs.A.after.gauge === 0,
  JSON.stringify(Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, r.after.gauge]))));
check('battle: no console errors', errors.length === 0, errors.join(' | '));

// From the map and back: a foe on the next tile is marked; a click on it opens the battle over
// the board at full resolution while the board stops drawing; once it is over, Space comes back
// to the board as it was, with the loser's Morale down by the rules' damage. At 0 it leaves.
errors.length = 0;
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
// The foes hold their ground here (the B7 AI has its own section): this one checks other things.
await page.evaluate(() => window.__map.holdFoes(true));
const mapUnits = () => page.evaluate(() => window.__map.units());
/** Puts `foe` on a free tile next to the first of `heroes` that has one; returns the pair as they now stand. */
const besides = async (heroes, foe) => {
  const taken = new Set((await mapUnits()).filter((u) => u.morale > 0).map((u) => `${u.x},${u.y}`));
  for (const hero of heroes) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [x, y] = [hero.x + dx, hero.y + dy];
      if (!taken.has(`${x},${y}`) && (await page.evaluate((x, y) => !!window.__map.tile(x, y), x, y))) {
        await page.evaluate((id, x, y) => window.__map.setUnit(id, { x, y }), foe.id, x, y);
        return [hero, { ...foe, x, y }];
      }
    }
  }
  throw new Error('no player unit has a free tile beside it');
};
/** A woman's Union is a + of her edge neighbours, a man's an x of his corners (src/game/union.ts). */
const UNION_SHAPE = { female: [[0, -1], [1, 0], [0, 1], [-1, 0]], male: [[1, -1], [1, 1], [-1, 1], [-1, -1]] };
/**
 * Makes `hero` stand alone, so its attack is a single battle (Unions are checked on their own):
 * any ally on its Union shape moves to a free tile at least three tiles away.
 */
const isolate = async (hero) => {
  for (;;) {
    const now = await mapUnits();
    const me = now.find((u) => u.id === hero.id);
    const near = now.find((u) => u.side === me.side && u.id !== me.id && u.morale > 0 && UNION_SHAPE[me.gender].some(([dx, dy]) => u.x === me.x + dx && u.y === me.y + dy));
    if (!near) return;
    const taken = new Set(now.filter((u) => u.morale > 0).map((u) => `${u.x},${u.y}`));
    let moved = false;
    for (let r = 3; r < 12 && !moved; r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        const [x, y] = [me.x + dx, me.y + dy];
        if (!taken.has(`${x},${y}`) && (await page.evaluate((x, y) => !!window.__map.tile(x, y), x, y))) {
          await page.evaluate((id, x, y) => window.__map.setUnit(id, { x, y }), near.id, x, y);
          moved = true;
          break;
        }
      }
    }
    if (!moved) throw new Error(`no free tile to move ${near.id} off ${hero.id}'s Union`);
  }
};
/** Waits until the camera stops moving (a selection eases it over), and returns its matrix. */
const stillCamera = async () => {
  let last = null;
  for (let i = 0; i < 60; i++) {
    const m = JSON.stringify((await page.evaluate(() => window.__map.camera())).matrix);
    if (m === last) return m;
    last = m;
    await frames(5);
  }
  return last;
};
/** Clicks a tile without moving the camera. */
const clickInPlace = async (x, y) => {
  const pos = await page.evaluate((x, y) => window.__map.aimAt(x, y), x, y);
  await page.mouse.click(pos.x, pos.y);
};
/**
 * Plays the open battle out and leaves it: Space skips a cut-in, then to the result, then goes on.
 * Pressed until the battle has left (or, in a Union, the next one opens), as a foe's skill may
 * fire at any moment now and its cut-in takes a press.
 */
const leaveBattle = async () => {
  const chain = await page.evaluate(() => window.__battle?.chain?.index ?? null);
  for (let n = 0; n < 12; n++) {
    const gone = await page.evaluate((c) => !window.__map.battling() || (window.__battle?.ready && (window.__battle.chain?.index ?? null) !== c), chain);
    if (gone) return;
    await page.keyboard.press('Space');
    await frames(4);
  }
};
/** Skips a battle that is open to its result, and goes back to the board. */
const finishBattle = async () => {
  await leaveBattle();
  await page.waitForFunction(() => !window.__map.battling(), { timeout: 30000 });
  await frames(3);
};
const allies = army.filter((u) => u.side === 'player');
const foes = army.filter((u) => u.side === 'enemy');
await clickCard(0);
const attackCard = (await turnNow()).card;
const [hero, foe1] = await besides(allies, foes[0]);
await isolate(hero);
await clickTile(hero.x, hero.y);
check('attack: a foe on the next tile is marked as a target', (await page.evaluate(() => window.__map.marked().target)) === 1);
await page.evaluate((x, y) => window.__map.setPose(45, 55, 1.6, x, y), foe1.x, foe1.y);
const cameraBefore = await stillCamera();
await clickInPlace(foe1.x, foe1.y);
await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
const fight = await page.evaluate(() => ({ canvas: window.__battle.canvas(), rules: window.__battle.rules(), drawn: window.__map.renderInfo().frame }));
await frames(10);
const drawnLater = await page.evaluate(() => window.__map.renderInfo().frame);
const { canvas: bc } = fight;
check('attack: the battle opens over the board at full resolution, and the board stops drawing',
  bc.w === Math.round(bc.cssW * bc.dpr) && bc.h === Math.round(bc.cssH * bc.dpr) && bc.cssW === 1920 && bc.cssH === 1080 && drawnLater === fight.drawn,
  JSON.stringify({ ...fight, drawnLater }));
// The foe was under the pointer as it was clicked: its unit window must not stay over the battle.
const overBattle = await page.evaluate(() => {
  const el = document.getElementById('unit-info');
  const r = el.getBoundingClientRect();
  const shown = !el.hidden && getComputedStyle(el).display !== 'none' && r.width > 0;
  return { shown, z: { battle: getComputedStyle(document.getElementById('battle')).zIndex, hud: getComputedStyle(document.getElementById('battle-hud')).zIndex } };
});
check("attack: the map's unit window is gone in the battle, and the battle stands above every map window",
  !overBattle.shown && Number(overBattle.z.battle) >= 20 && Number(overBattle.z.hud) > Number(overBattle.z.battle), JSON.stringify(overBattle));
await shot('15-attack-battle');
// Whether coming back from the battle passed the turn to the foes is watched from inside the page:
// holding their ground, their turn lasts only as long as their card shows.
await page.evaluate(() => {
  const log = (window.__turnLog = []);
  const watch = () => {
    const t = window.__map.turn();
    const box = document.getElementById('turn-info')?.className;
    if (!log.length || log.at(-1).side !== t.side) log.push({ side: t.side, number: t.number, box });
    if (log.length < 3) requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
});
await finishBattle();
const afterBattle = { turn: await turnNow(), box: await turnBox() };
const foesWent = await page.evaluate(() => window.__turnLog.some((t) => t.side === 'enemy' && t.number === 1 && t.box === 'enemy'));
// A second attack: the same click again does nothing while the turn is the foes'.
await clickInPlace(hero.x, hero.y);
await frames(3);
await clickInPlace(foe1.x, foe1.y);
await frames(3);
const again = await page.evaluate(() => ({ battling: window.__map.battling(), selected: window.__map.selected() }));
// The clicks take no orders if the foes' turn is still on; if it has already passed back, the
// player's new turn has no card yet, so no attack either way.
const stillFoes = afterBattle.turn.side === 'enemy';
check("attack: the battle's POW is the card's, and coming back from it ends the turn (no second attack)",
  fight.rules.pow === attackCard.pow && foesWent && !again.battling && (!stillFoes || again.selected === null),
  JSON.stringify({ pow: fight.rules.pow, attackCard, foesWent, afterBattle, again }));
const back = await mapUnits();
const loser = fight.rules.winner === 'attacker' ? foe1 : hero;
const loserNow = back.find((u) => u.id === loser.id);
check("attack: back on the board, the loser's Morale is down by the rules' damage",
  loserNow.morale === loser.morale - fight.rules.damage && back.find((u) => u.id === (loser === hero ? foe1 : hero).id).morale === (loser === hero ? foe1 : hero).morale,
  JSON.stringify({ rules: fight.rules, loser: loserNow }));
check('attack: the camera is where it was, and the battle is gone from the page',
  (await stillCamera()) === cameraBefore && (await page.evaluate(() => !document.getElementById('battle') && !document.getElementById('battle-hud') && !window.__battle)));
await shot('16-attack-back');
await untilPlayerTurn();
await frames(3);
const turn2After = { turn: await turnNow(), hand: await handNow() };
check('attack: after the foes, turn 2 opens on the hand with the card used', turn2After.turn.number === 2 && turn2After.turn.card === null && turn2After.hand.open && turn2After.hand.cards[0].used,
  JSON.stringify(turn2After));
// A battle between two units at 5 Morale, on the next turn: the loser drops to 0 and leaves the board.
await clickCard(1);
const [hero2, foe3] = await besides(allies.filter((u) => u.id !== hero.id), foes[1]);
await isolate(hero2);
for (const u of [hero2, foe3]) await page.evaluate((id) => window.__map.setUnit(id, { morale: 5 }), u.id);
await clickTile(hero2.x, hero2.y);
await clickInPlace(foe3.x, foe3.y);
await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
const rules2 = await page.evaluate(() => window.__battle.rules());
await finishBattle();
const gone = rules2.winner === 'attacker' ? foe3 : hero2;
await clickTile(gone.x, gone.y);
const left = await page.evaluate((id) => ({ morale: window.__map.units().find((u) => u.id === id).morale, selected: window.__map.selected() }), gone.id);
check('attack: a unit at 0 Morale leaves the board', left.morale === 0 && left.selected === null, JSON.stringify({ rules2, left }));
check('attack: no console errors', errors.length === 0, errors.join(' | '));

// ---- Unions (B5): the highlight is the rules' Union, and an attack plays one battle per member -
// Aria (a woman: a + Union) stands with an ally above her and one to her right, and a foe below.
// Selected, her two allies are marked gold and the shape's two other places edged; attacking, she
// and then each ally fight the foe in turn, the foe carrying its Morale losses down the chain.
errors.length = 0;
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
// The foes hold their ground here (the B7 AI has its own section): this one checks other things.
await page.evaluate(() => window.__map.holdFoes(true));
const uStart = await mapUnits();
const aria = uStart.find((u) => u.side === 'player' && u.gender === 'female' && u.cls === 'sword');
const [allyTop, allyRight] = uStart.filter((u) => u.side === 'player' && u !== aria).slice(0, 2);
const uFoe = uStart.find((u) => u.side === 'enemy');
/** A centre near Aria whose + places are all on the board and clear of every other unit. */
const unionSpot = async () => {
  const mine = new Set([aria.id, allyTop.id, allyRight.id, uFoe.id]);
  const taken = new Set((await mapUnits()).filter((u) => u.morale > 0 && !mine.has(u.id)).map((u) => `${u.x},${u.y}`));
  for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const [x, y] = [aria.x + dx, aria.y + dy];
        const spots = [[x, y], [x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]];
        if (spots.some(([a, b]) => taken.has(`${a},${b}`))) continue;
        if ((await page.evaluate((s) => s.every(([a, b]) => !!window.__map.tile(a, b)), spots))) return [x, y];
      }
    }
  }
  throw new Error('no room for a Union near Aria');
};
/** Stands the Union and its foe: Aria at the centre, allies above and to the right, the foe below. */
const standUnion = async (foeMorale) => {
  const [x, y] = await unionSpot();
  for (const [u, ux, uy, morale] of [[aria, x, y, aria.morale], [allyTop, x, y - 1, allyTop.morale], [allyRight, x + 1, y, allyRight.morale], [uFoe, x, y + 1, foeMorale]]) {
    await page.evaluate((id, c) => window.__map.setUnit(id, c), u.id, { x: ux, y: uy, morale });
  }
  return [x, y];
};
/** Plays every battle of the attack now opening, skipping each to its result; returns what each showed. */
const playChain = async () => {
  const seen = [];
  for (;;) {
    const i = seen.length;
    const next = await page.waitForFunction((i) => (window.__map.battling() && window.__battle?.chain !== undefined && (window.__battle.chain?.index ?? 0) === i ? 'battle' : !window.__map.battling() && i > 0 ? 'done' : null), { timeout: 30000 }, i);
    if ((await next.jsonValue()) === 'done') return seen;
    const one = await page.evaluate(() => ({ chain: window.__battle.chain, attacker: window.__battle.attacker, defenderMorale: window.__battle.defenderMorale }));
    for (let n = 0; n < 6 && !(await page.evaluate(() => !!window.__battle?.result?.())); n++) {
      await page.keyboard.press('Space');
      await frames(4);
    }
    seen.push({ ...one, rules: await page.evaluate(() => window.__battle.rules()) });
    await leaveBattle();
  }
};
await clickCard(0);
const [ux, uy] = await standUnion(9000);
await clickTile(ux, uy);
const unionMarks = { marked: await page.evaluate(() => window.__map.marked()), ids: await page.evaluate(() => window.__map.union()) };
check('union: selected, the leader\'s allies on its shape are marked, and its empty places edged: exactly the rules\' Union',
  unionMarks.marked.union === 2 && unionMarks.marked.shape === 2 && JSON.stringify(unionMarks.ids) === JSON.stringify([aria.id, allyTop.id, allyRight.id]), JSON.stringify(unionMarks));
await shot('21-union-highlight');
await clickInPlace(ux, uy + 1);
const chain = await playChain();
const foeAfter = (await mapUnits()).find((u) => u.id === uFoe.id).morale;
const carried = chain.every((b, i) => i === 0 || b.defenderMorale === chain[i - 1].defenderMorale - (chain[i - 1].rules.winner === 'attacker' ? chain[i - 1].rules.damage : 0));
const last = chain[chain.length - 1];
check('union: the attack plays one battle per member, in the Union\'s order, labelled UNION 1 / 3 to 3 / 3',
  chain.length === 3 && chain.map((b) => b.attacker).join() === unionMarks.ids.join() && chain.map((b) => `${b.chain.index + 1}/${b.chain.count}`).join() === '1/3,2/3,3/3', JSON.stringify(chain.map((b) => [b.attacker, b.chain])));
check('union: the foe carries its Morale losses from one battle to the next, and the board shows the end of the chain',
  carried && foeAfter === last.defenderMorale - (last.rules.winner === 'attacker' ? last.rules.damage : 0), JSON.stringify({ morale: chain.map((b) => [b.defenderMorale, b.rules.winner, b.rules.damage]), foeAfter }));
// Next turn, against a foe on its last Morale: the chain stops at the first battle that fells it.
await untilPlayerTurn();
await clickCard(1);
const [vx, vy] = await standUnion(1);
await clickTile(vx, vy);
await clickInPlace(vx, vy + 1);
const short = await playChain();
const firstWin = short.findIndex((b) => b.rules.winner === 'attacker');
check('union: the chain stops as soon as the foe falls',
  firstWin >= 0 ? short.length === firstWin + 1 && (await mapUnits()).find((u) => u.id === uFoe.id).morale === 0 : short.length === 3, JSON.stringify(short.map((b) => [b.attacker, b.rules.winner])));
check('union: no console errors', errors.length === 0, errors.join(' | '));

// ---- Card skills (B6): a skill fires only with a full gauge and the card's ACE, K fires it ----
// The meadow's hand holds Long Road and Steady Line (for All, so Aria can wield them), Swift
// Banner (a lance's, which she can't) and King's Wager (All In: it fills every ally's gauge as it
// is played). Each turn Aria fights a foe; the battle holds for the choice only when she can fire.
errors.length = 0;
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
// The foes hold their ground here (the B7 AI has its own section): this one checks other things.
await page.evaluate(() => window.__map.holdFoes(true));
const kStart = await mapUnits();
const kAriaId = kStart.find((u) => u.name === 'Aria').id;
const kFoes = kStart.filter((u) => u.side === 'enemy');
const kHand = (await handNow()).cards.map((c) => c.id);
const skillNow = () => page.evaluate(() => window.__battle.skill());
const unitNow = async (id) => (await mapUnits()).find((u) => u.id === id);
/** On the player's turn: plays card `id`, stands `hero` (Aria by default) alone beside `foe` with `gauge`, and attacks; resolves with the battle up. */
const skillBattle = async (id, gauge, foe, hero = kAriaId) => {
  await untilPlayerTurn();
  await clickCard(kHand.indexOf(id));
  // A clear spot near her (the Union section's finder), the foe below her, no ally on her shape.
  const [x, y] = await unionSpot();
  // Anyone else on the two tiles trades places with the hero (the finder sees past the Union section's units).
  const was = await unitNow(hero);
  for (const u of (await mapUnits()).filter((u) => u.id !== hero && u.id !== foe.id && u.morale > 0 && u.x === x && (u.y === y || u.y === y + 1))) {
    await page.evaluate((id, c) => window.__map.setUnit(id, c), u.id, { x: was.x, y: was.y });
  }
  await page.evaluate((id, c) => window.__map.setUnit(id, c), hero, { x, y, gauge });
  await page.evaluate((id, c) => window.__map.setUnit(id, c), foe.id, { x, y: y + 1, gauge: 0 });
  await isolate({ id: hero });
  await clickTile(x, y);
  await clickInPlace(x, y + 1);
  const f = { ...foe, x, y: y + 1 };
  await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
  await frames(6);
  return f;
};
// Turn 1, Long Road with a full gauge: the battle holds at READY; K fires Forced March and its cut-in.
const kFoe1 = await skillBattle('long-road', 100, kFoes[0]);
const k1Ready = await skillNow();
await shot('22-skill-ready');
await page.keyboard.press('KeyK');
await page.waitForFunction(() => window.__battle.skill().cutIn.on, { timeout: 5000 }).catch(() => {});
const k1Cut = await skillNow();
await shot('23-skill-cut-in');
await page.waitForFunction(() => !window.__battle.skill().held, { timeout: 10000 }).catch(() => {});
const k1Rules = await page.evaluate(() => window.__battle.rules());
const k1Before = { aria: await unitNow(kAriaId), foe: await unitNow(kFoe1.id) };
await finishBattle();
const k1After = { aria: await unitNow(kAriaId), foe: await unitNow(kFoe1.id) };
check("skills: with a full gauge and the card's ACE, the battle holds for the choice, and K fires the skill with its cut-in",
  k1Ready.state === 'ready' && k1Ready.held && k1Cut.fired === 'forced-march' && k1Cut.cutIn.on && k1Cut.state === 'fired', JSON.stringify({ k1Ready, k1Cut }));
const k1Loser = k1Rules.winner === 'attacker' ? 'foe' : 'aria';
check('skills: the result is the rules\' with the skill fired, and the gauge was spent (shown empty as it fires, then charging again)',
  k1After[k1Loser].morale === k1Before[k1Loser].morale - k1Rules.damage && k1Cut.gauge.player === 0, JSON.stringify({ k1Rules, k1Before, k1After, k1Cut }));
// Turn 2, Swift Banner (a lance's): Aria can't wield it, so no hold, K does nothing, the gauge stays.
await skillBattle('swift-banner', 100, kFoes[1]);
const k2 = await skillNow();
await page.keyboard.press('KeyK');
await frames(6);
const k2After = await skillNow();
await finishBattle();
check("skills: a card whose ACE the unit can't wield neither holds nor fires, the guide says what it needs, and the gauge stays full",
  k2.state === 'ace' && !k2.held && k2After.fired === null && (await unitNow(kAriaId)).gauge === 100, JSON.stringify({ k2, k2After }));
// Turn 3, Steady Line as a Union attack: Aria (full) saves her gauge with Space; her two allies are charging.
await untilPlayerTurn();
await clickCard(kHand.indexOf('steady-line'));
const [kx, ky] = await standUnion(9000);
// (The foe comes in empty: a defender's skill would fire now, and this checks the player's.)
for (const [id, g] of [[kAriaId, 100], [allyTop.id, 40], [allyRight.id, 40], [uFoe.id, 0]]) await page.evaluate((id, g) => window.__map.setUnit(id, { gauge: g }), id, g);
await clickTile(kx, ky);
await clickInPlace(kx, ky + 1);
const k3 = [];
for (let i = 0; i < 3; i++) {
  await page.waitForFunction((i) => window.__map.battling() && window.__battle?.chain?.index === i, { timeout: 30000 }, i);
  await frames(6);
  const s = await skillNow();
  k3.push({ ...s, attacker: await page.evaluate(() => window.__battle.attacker) });
  // The leader's battle holds for the choice: Space fights on, the skill kept (still ready to fire).
  if (s.state === 'ready') {
    await page.keyboard.press('Space');
    await frames(3);
    const a = await skillNow();
    k3[i].after = { state: a.state, choosing: a.choosing, held: a.held };
  }
  await leaveBattle();
}
await page.waitForFunction(() => !window.__map.battling(), { timeout: 30000 });
check('skills: Space at the opening fights on with the skill kept (still READY, the gauge full), and a unit whose gauge isn\'t full fights on, charging',
  k3[0].state === 'ready' && k3[0].choosing && k3[0].after?.state === 'ready' && !k3[0].after.choosing && !k3[0].after.held && k3[0].fired === null && (await unitNow(kAriaId)).gauge === 100 &&
  k3.slice(1).every((b) => b.state === 'charging' && !b.choosing && (!b.held || (b.foeFired && b.cutIn.on))), JSON.stringify(k3));
// Turn 4, King's Wager: All In fills every ally's gauge as it is played.
await untilPlayerTurn();
for (const u of (await mapUnits()).filter((u) => u.side === 'player')) await page.evaluate((id) => window.__map.setUnit(id, { gauge: 0 }), u.id);
await clickCard(kHand.indexOf('kings-wager'));
const allInBursts = await page.evaluate(() => window.__map.allIn());
const k4 = (await mapUnits()).filter((u) => u.side === 'player' && u.morale > 0);
check("skills: King's Wager (All In) fills every ally's gauge as it is played, a burst of gold over each", k4.length > 0 && k4.every((u) => u.gauge === 100) && allInBursts === k4.length,
  JSON.stringify({ bursts: allInBursts, units: k4.map((u) => [u.name, u.gauge]) }));
// SKILL READY: once the burst has played, a sparkle by every full gauge's head. All In acts on play,
// so with King's Wager in play the allies' marks are held (SAVED); a foe's full gauge shows ready.
// The foes' gauges are emptied first: their own cards and battles may have filled them by now.
await page.waitForFunction(() => window.__map.allIn() === 0, { timeout: 10000 });
const kFoes2 = (await mapUnits()).filter((u) => u.side === 'enemy' && u.morale > 0);
for (const u of kFoes2) await page.evaluate((id) => window.__map.setUnit(id, { gauge: 0 }), u.id);
await frames(3);
const k5 = await page.evaluate(() => window.__map.skillMarks());
await page.evaluate((id) => window.__map.setUnit(id, { gauge: 100 }), kFoes2[0].id);
await frames(3);
const k6 = await page.evaluate(() => window.__map.skillMarks());
check("skills: SKILL READY marks every full gauge on the map: held by the card in play (King's Wager), and a foe's (by the card its side played last)",
  k5.held === k4.length && k5.ready === 0 && k6.ready + k6.held === k4.length + 1, JSON.stringify({ k5, k6 }));
check('skills: no console errors', errors.length === 0, errors.join(' | '));

// ---- Skills mid-battle (2026-11-08) ----------------------------------------------------------------
// The stance drives the gauge: Passive charges it fast, Neutral slowly, Aggressive drains it. A
// gauge that fills mid-battle lights READY with no hold, and K fires it there; a skill whose
// moment has passed (Firestorm after the charge) acts at once, and the guide says so.
errors.length = 0;
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
await page.evaluate(() => window.__map.holdFoes(true));
const mStart = await mapUnits();
const mIlse = mStart.find((u) => u.side === 'player' && u.cls === 'mage');
const mFoe = mStart.find((u) => u.side === 'enemy');
await skillBattle('ember-rite', 80, mFoe, mIlse.id);
const m0 = await skillNow();
await page.keyboard.press('KeyD');
await frames(3);
const mStance = await page.evaluate(() => window.__battle.stances());
await page.waitForFunction(() => { const s = window.__battle.skill(); return s.state === 'ready' || s.phase === 'done'; }, { timeout: 30000 }).catch(() => {});
const m1 = await skillNow();
await shot('22b-skill-mid-battle');
await page.keyboard.press('KeyK');
await page.waitForFunction(() => window.__battle.skill().cutIn.on, { timeout: 5000 }).catch(() => {});
const m2 = await skillNow();
await page.waitForFunction(() => !window.__battle.skill().held, { timeout: 15000 }).catch(() => {});
// The battle's next beat: the blast, whatever the phase.
await page.waitForFunction((b) => window.__battle.skill().played > b, { timeout: 20000 }, m2.played).catch(() => {});
const mFx = await page.evaluate(() => window.__battle.fx());
check('skills mid-battle: a gauge below full opens charging with no hold; Passive charges it from 80 to READY mid-battle',
  m0.state === 'charging' && !m0.held && mStance.attacker === 'passive' && m1.state === 'ready' && !m1.held && !m1.choosing && m1.played >= 1,
  JSON.stringify({ m0, mStance, m1 }));
check("skills mid-battle: K fires it there, with its cut-in; the gauge shows empty, and the late Firestorm says it acts at once and blasts",
  m2.fired === 'firestorm' && m2.firedBeat >= 1 && m2.cutIn.on && m2.gauge.player === 0 && /at once/.test(m1.late ?? '') && mFx.skillShows > 0,
  JSON.stringify({ m1, m2, mFx }));
await finishBattle();
check('skills mid-battle: no console errors', errors.length === 0, errors.join(' | '));

// ---- The foes' AI and the end (B7) ---------------------------------------------------------------
// A foe beside an ally attacks it on the foes' turn; the player defends (D sets the defender's
// stance) and the board shows the battle's own result. Hard turns down a fight it would lose. The
// last foe falling is VICTORY, with the stats and Play again; the last ally falling is DEFEAT.
errors.length = 0;
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
const b7 = async () => {
  const all = await mapUnits();
  return { all, aria: all.find((u) => u.name === 'Aria'), varek: all.find((u) => u.name === 'Varek') };
};
/** Stands ally `a` on a clear spot with foe `f` just below it, nobody else on either one's Union shape. */
const standPair = async (aId, fId, aChanges = {}, fChanges = {}) => {
  const [x, y] = await unionSpot();
  const was = await unitNow(aId);
  for (const u of (await mapUnits()).filter((u) => u.id !== aId && u.id !== fId && u.morale > 0 && u.x === x && (u.y === y || u.y === y + 1))) {
    await page.evaluate((id, c) => window.__map.setUnit(id, c), u.id, { x: was.x, y: was.y });
  }
  await page.evaluate((id, c) => window.__map.setUnit(id, c), aId, { x, y, ...aChanges });
  await page.evaluate((id, c) => window.__map.setUnit(id, c), fId, { x, y: y + 1, ...fChanges });
  await isolate({ id: aId });
  await isolate({ id: fId });
  return [x, y];
};
// A foe attack, on Easy: Varek beside Aria attacks her; she defends.
let { aria: b7Aria, varek: b7Varek } = await b7();
await clickCard(0);
await standPair(b7Aria.id, b7Varek.id);
const b7Before = await mapUnits();
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__map.battling() && window.__battle?.ready, { timeout: 60000 });
await page.keyboard.press('KeyD');
await frames(3);
const b7Stances = await page.evaluate(() => window.__battle.stances());
await shot('24-foe-attack');
await page.keyboard.press('Space');
await page.waitForFunction(() => !!window.__battle.result(), { timeout: 30000 });
const b7Result = await page.evaluate(() => window.__battle.result());
await untilPlayerTurn();
const b7After = await mapUnits();
const b7Side = (id) => b7Before.find((u) => u.id === id).side;
const b7Loser = b7Result.winner === 'attacker' ? b7Result.defender : b7Result.attacker;
const b7Lost = b7Before.find((u) => u.id === b7Loser).morale - b7After.find((u) => u.id === b7Loser).morale;
check("foes: on their turn a foe beside an ally attacks it; the foe on the left, the player defending on the right, D sets the defender's stance",
  b7Side(b7Result.attacker) === 'enemy' && b7Side(b7Result.defender) === 'player' && b7Stances.defender === 'passive', JSON.stringify({ b7Result, b7Stances }));
check("foes: the board shows the foe battle's own result", b7Lost === b7Result.damage, JSON.stringify({ b7Result, b7Lost }));
// Defending fires too (2026-11-08): the card the side played last. Steady Line (for All) this turn,
// Aria full beside Varek; in his attack the battle holds for her choice and K fires Hold Fast.
({ aria: b7Aria, varek: b7Varek } = await b7());
await clickCard((await handNow()).cards.findIndex((c) => c.id === 'steady-line'));
await standPair(b7Aria.id, b7Varek.id, { gauge: 100 });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__map.battling() && window.__battle?.ready, { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('wipe') && !document.querySelector('#battle-hud.intro'), { timeout: 15000 }).catch(() => {});
await frames(6);
const d0 = { ...(await skillNow()), attacker: await page.evaluate(() => window.__battle.attacker) };
await shot('24b-defend-skill');
await page.keyboard.press('KeyK');
await page.waitForFunction(() => window.__battle.skill().cutIn.on, { timeout: 5000 }).catch(() => {});
const d1 = await skillNow();
await page.waitForFunction(() => !window.__battle.skill().held, { timeout: 15000 }).catch(() => {});
const dRules = await page.evaluate(() => window.__battle.rules());
await page.keyboard.press('Space');
await page.waitForFunction(() => !!window.__battle.result(), { timeout: 30000 });
const dResult = await page.evaluate(() => window.__battle.result());
await untilPlayerTurn();
check("skills defending: a foe attacks Aria (full, Steady Line played last): the battle holds for her choice, and K fires Hold Fast with its cut-in",
  d0.attacker === b7Varek.id && d0.state === 'ready' && d0.choosing && d1.fired === 'hold-fast' && d1.cutIn.on, JSON.stringify({ d0, d1 }));
check('skills defending: the result is the rules\' with her skill fired', dResult.winner === dRules.winner && dResult.damage === dRules.damage, JSON.stringify({ dRules, dResult }));
// Hard turns down a fight it forecasts to lose: Varek on 5 Morale beside Corin, whose axe beats his
// lance. (A battle starts at full strength whatever the Morale, so the low Morale alone isn't a loss:
// it is what a loss would cost him, the whole unit.)
await page.goto(`${url}?map=meadow&foes=hard`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
({ varek: b7Varek } = await b7());
const b7Corin = (await mapUnits()).find((u) => u.name === 'Corin');
await clickCard(0);
await standPair(b7Corin.id, b7Varek.id, {}, { morale: 5 });
// Varek and Corin alone: the armies start close now, and with full soldiers whatever his Morale,
// Varek would rightly march on an ally his lance beats (or another foe fight its own fight).
for (const u of (await mapUnits()).filter((u) => u.id !== b7Varek.id && u.id !== b7Corin.id)) await page.evaluate((id) => window.__map.setUnit(id, { morale: 0 }), u.id);
await page.evaluate(() => {
  window.__fought = false;
  const watch = () => {
    if (window.__map.battling()) window.__fought = true;
    if (window.__map.turn().side !== 'player' || window.__map.battling()) requestAnimationFrame(watch);
  };
  setTimeout(() => requestAnimationFrame(watch), 0);
});
await page.keyboard.press('Enter');
await untilPlayerTurn();
const b7Hard = { difficulty: await page.evaluate(() => window.__map.difficulty()), fought: await page.evaluate(() => window.__fought), varek: (await unitNow(b7Varek.id)).morale };
check('foes: on Hard they turn down a fight they forecast to lose', b7Hard.difficulty === 'hard' && !b7Hard.fought && b7Hard.varek === 5, JSON.stringify(b7Hard));
// VICTORY: the last foe, on its last Morale, falls to Aria; the result screen, then Play again.
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
({ aria: b7Aria, varek: b7Varek } = await b7());
await clickCard(0);
for (const u of (await mapUnits()).filter((u) => u.side === 'enemy' && u.id !== b7Varek.id)) await page.evaluate((id) => window.__map.setUnit(id, { morale: 0 }), u.id);
const [wx, wy] = await standPair(b7Aria.id, b7Varek.id, {}, { morale: 1 });
await clickTile(wx, wy);
await clickInPlace(wx, wy + 1);
await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
await leaveBattle();
await page.waitForFunction(() => !!window.__map.result(), { timeout: 30000 });
const b7Win = await page.evaluate(() => window.__map.result());
await new Promise((r) => setTimeout(r, 800)); // the result screen fades in
await shot('25-victory');
check('end: the last foe falling is VICTORY, with the stats', b7Win.result === 'victory' && /Victory/i.test(b7Win.text) && /Foes felled\s*5/.test(b7Win.text) && /Allies lost\s*0/.test(b7Win.text), JSON.stringify(b7Win));
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.press('Enter');
await page.waitForFunction(() => !window.__map.result() && window.__map.hand().open, { timeout: 30000 });
const b7Again = { turn: await turnNow(), units: await mapUnits() };
check('end: Play again starts a fresh skirmish on the same map', b7Again.turn.number === 1 && b7Again.units.every((u) => u.morale > 0), JSON.stringify(b7Again.turn));
// DEFEAT: the last ally, on her last Morale, beside Varek on the foes' turn.
({ aria: b7Aria, varek: b7Varek } = await b7());
await clickCard(0);
for (const u of (await mapUnits()).filter((u) => u.side === 'player' && u.id !== b7Aria.id)) await page.evaluate((id) => window.__map.setUnit(id, { morale: 0 }), u.id);
await standPair(b7Aria.id, b7Varek.id, { morale: 1 });
await page.keyboard.press('Enter');
await untilPlayerTurn();
const b7Loss = await page.evaluate(() => window.__map.result());
await new Promise((r) => setTimeout(r, 800)); // the result screen fades in
await shot('26-defeat');
check('end: the last ally falling is DEFEAT', b7Loss?.result === 'defeat' && /Defeat/i.test(b7Loss.text), JSON.stringify(b7Loss));
check('foes: no console errors', errors.length === 0, errors.join(' | '));

// ---- Polish (B8): sound, the four transitions and the battle effects ----------------------------
// Sound can't be heard here, so the checks read its state: no audio until the first input, M mutes
// it and the setting comes back after a reload, the battle asks for its effects, and the music
// missing asks for no files. The transitions last about a second each, so they are watched from
// inside the page as they come and go: the wipe, the turn banners and the battle HUD's intro.
errors.length = 0;
const watcher = await page.evaluateOnNewDocument(() => {
  window.__seen = [];
  const note = (el) => {
    if (['wipe', 'turn-banner', 'battle-hud'].includes(el.id)) window.__seen.push({ id: el.id, cls: el.className, text: el.id === 'turn-banner' ? el.textContent : '' });
  };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') note(m.target);
      else for (const n of m.addedNodes) if (n.nodeType === 1) note(n);
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
});
const seenNow = () => page.evaluate(() => window.__seen);
const sound = () => page.evaluate(() => ({ ...window.__audio.state(), speaker: document.querySelector('#hud .speaker')?.textContent }));
// From saved settings of none (a click of an earlier section can land on the menu's speaker).
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.removeItem('diorama.audio'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
const fresh = await sound();
check('sound: no audio before the first click, tap or key, and no music asked for while it has none', !fresh.ready && !fresh.settings.muted && fresh.speaker === 'Sound: on' && fresh.playing === null, JSON.stringify(fresh));
await page.keyboard.press('KeyM');
const muted = await sound();
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
await page.evaluate(() => window.__map.holdFoes(true));
const kept = await sound();
await page.keyboard.press('KeyM');
const unmuted = await sound();
check('sound: the first key starts it, M mutes it, and the setting comes back after a reload',
  muted.ready && muted.settings.muted && muted.speaker === 'Sound: off' && !kept.ready && kept.settings.muted && kept.speaker === 'Sound: off' && unmuted.ready && !unmuted.settings.muted,
  JSON.stringify({ muted, kept, unmuted }));
// The menu folds into a bar: Tab or its button folds it out, Esc or a click on the board folds it away.
const menuNow = () => page.evaluate(() => ({ open: !document.querySelector('#hud .menu').hidden, h: Math.round(document.getElementById('hud').getBoundingClientRect().height) }));
const menuFolded = await menuNow();
await page.keyboard.press('Tab');
const menuTabbed = await menuNow();
await page.keyboard.press('Escape');
const menuEscaped = await menuNow();
await page.click('#hud .menu-toggle');
const menuClicked = await menuNow();
await page.mouse.click(1915, 540);
const menuAway = await menuNow();
check('menu: folded into a bar at start; Tab or its button folds it out, Esc or a click elsewhere folds it away',
  !menuFolded.open && menuFolded.h <= 100 && menuTabbed.open && menuTabbed.h > 200 && !menuEscaped.open && menuClicked.open && !menuAway.open,
  JSON.stringify({ menuFolded, menuTabbed, menuEscaped, menuClicked, menuAway }));
const opening8 = await seenNow();
check('transitions: the first turn opens with its banner', opening8.some((s) => s.id === 'turn-banner' && s.cls === 'player' && /Your turn/i.test(s.text) && /Turn 1/.test(s.text)), JSON.stringify(opening8));
// The card played lifts out of the hand and flies to the turn box.
await clickCard(0);
await page.waitForFunction(() => window.__map.hand().view.flights > 0 && !window.__map.hand().view.flying, { timeout: 10000 }).catch(() => {});
const flown = { flights: (await handNow()).view.flights, played: (await sound()).played };
check('transitions: the card played flies to the turn box, with its sound', flown.flights === 1 && flown.played.card >= 1, JSON.stringify(flown));
// An attack: the blade covers the board, the battle opens behind it with the intro, and the sweep goes on.
let p8 = await b7();
const [p8x, p8y] = await standPair(p8.aria.id, p8.varek.id);
await clickTile(p8x, p8y);
const p8From = (await seenNow()).length;
await clickInPlace(p8x, p8y + 1);
await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
await page.waitForFunction(() => !document.getElementById('wipe') && !document.querySelector('#battle-hud.intro'), { timeout: 15000 }).catch(() => {});
// A card that fills the gauge holds the battle for the choice: Space saves it.
if (await page.evaluate(() => window.__battle.skill().held)) {
  await page.keyboard.press('Space');
  await frames(3);
}
// The blows, the clock stepped through the battle: each one's burst, and its sound.
const struck = await page.evaluate(() => {
  const b = window.__battle;
  const before = { fx: b.fx(), played: window.__audio.state().played };
  for (let t = 0; t <= b.length(); t += 0.1) b.at(t);
  b.at(b.length() + 0.5);
  return { before, fx: b.fx(), played: window.__audio.state().played, hud: document.getElementById('battle-hud').className };
});
const blows = (p) => (p.hit ?? 0) + (p.clash ?? 0) + (p.crit ?? 0);
check('effects: the blows burst in sparks as they land, and sound', struck.fx.bursts - struck.before.fx.bursts >= 3 && blows(struck.played) > blows(struck.before.played), JSON.stringify(struck));
check("transitions: at the result the loser's Morale loss lands with a punch", /lost-(left|right)/.test(struck.hud), struck.hud);
await shot('27-b8-result');
await page.keyboard.press('Space');
await untilPlayerTurn();
await page.waitForFunction(() => !document.getElementById('wipe'), { timeout: 10000 }).catch(() => {});
const p8Seen = (await seenNow()).slice(p8From);
const sweeps = p8Seen.filter((s) => s.id === 'wipe' && s.cls).map((s) => s.cls).filter((c, i, all) => c !== all[i - 1]);
check('transitions: the wipe covers the board into the battle and back out, and is gone after',
  sweeps.join(',') === 'cover,reveal,cover,reveal' && !(await page.evaluate(() => !!document.getElementById('wipe'))), JSON.stringify(sweeps));
check('transitions: the battle opens with its intro (the banners slide in, the VS slams down)', p8Seen.some((s) => s.id === 'battle-hud' && /\bintro\b/.test(s.cls)), JSON.stringify(p8Seen.filter((s) => s.id === 'battle-hud')));
const banners8 = p8Seen.filter((s) => s.id === 'turn-banner').map((s) => `${s.cls}: ${s.text}`).filter((c, i, all) => c !== all[i - 1]);
check("transitions: each turn opens with its banner, the foes' in red and the player's next",
  banners8.some((b) => /^enemy: Foes' turn\s*Turn 1/i.test(b)) && banners8.some((b) => /^player: Your turn\s*Turn 2/i.test(b)), JSON.stringify(banners8));
// Every transition off (?fx=none): no flight, wipe, banner or intro, and the turn plays the same.
await page.goto(`${url}?map=meadow&fx=none`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
await page.evaluate(() => window.__map.holdFoes(true));
await clickCard(0);
const bareCard = { played: !!(await turnNow()).card, flights: (await handNow()).view.flights };
p8 = await b7();
const [n8x, n8y] = await standPair(p8.aria.id, p8.varek.id);
await clickTile(n8x, n8y);
await clickInPlace(n8x, n8y + 1);
await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
await leaveBattle();
await page.waitForFunction(() => !window.__map.battling(), { timeout: 30000 });
await untilPlayerTurn();
const bareSeen = await seenNow();
const bareTurn = await turnNow();
check('transitions: with ?fx=none there is no flight, wipe, banner or intro, and the turn plays the same',
  bareCard.played && bareCard.flights === 0 && !bareSeen.some((s) => s.id !== 'battle-hud' || /intro|outro/.test(s.cls)) && bareTurn.side === 'player' && bareTurn.number === 2,
  JSON.stringify({ bareCard, bareSeen, bareTurn }));
await page.removeScriptToEvaluateOnNewDocument(watcher.identifier);
// Every battle skill's animation is scheduled where the skill acts, and shows on screen while it
// does: scanned on the battle's own clock (Pike Wall and Parry are the defender's; the seeds are
// ones where Executioner meets the leader, Rend wins and Hold Fast loses).
const skillShows = {};
const skillCases = [
  ['firestorm', 'a=mage&d=sword&fire=firestorm&seed=3'], ['volley', 'a=bow&d=sword&fire=volley&seed=3'], ['lance-charge', 'a=knight&d=sword&fire=lance-charge&seed=3'],
  ['forced-march', 'a=sword&d=axe&fire=forced-march&seed=3'], ['blade-dance', 'a=sword&d=axe&fire=blade-dance&seed=3'], ['pike-wall', 'a=sword&d=spear&dfire=pike-wall&seed=3'],
  ['parry', 'a=sword&d=spear&dfire=parry&seed=3'], ['executioner', 'a=axe&d=sword&fire=executioner&seed=1'], ['rend', 'a=axe&d=spear&fire=rend&seed=1'],
  ['hold-fast', 'a=sword&d=spear&fire=hold-fast&seed=1'], ['trample', 'a=knight&d=sword&fire=trample&seed=3'],
];
for (const [skill, query] of skillCases) {
  await page.goto(`${url}?mode=battle&${query}&at=0`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__battle?.ready, { timeout: 60000 });
  skillShows[skill] = await page.evaluate(() => {
    const length = window.__battle.length();
    let lit = 0;
    for (let t = 0; t <= length; t += 0.1) {
      window.__battle.at(t);
      lit = Math.max(lit, window.__battle.fx().skillLit);
    }
    return { shows: window.__battle.fx().skillShows, lit };
  });
}
check('skills: every battle skill plays its own animation where it acts (all eleven)',
  Object.keys(skillShows).length === 11 && Object.values(skillShows).every((s) => s.shows > 0 && s.lit > 4), JSON.stringify(skillShows));
// The weapon symbols on the banners: each side's type, STRONG for the one whose weapon beats the other's.
await page.goto(`${url}?mode=battle&a=sword&d=axe&seed=3&at=0`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__battle?.ready, { timeout: 60000 });
await page.evaluate(() => window.__battle.at(2));
const weaponBadges = await page.evaluate(() => [...document.querySelectorAll('#battle-hud .banner')].map((b) => {
  const w = b.querySelector('.weapon');
  const [r, br] = [w?.getBoundingClientRect(), b.getBoundingClientRect()];
  return { weapon: w?.dataset.weapon, tag: w?.querySelector('.tag')?.textContent, svg: !!w?.querySelector('svg path'), clear: !!r && (r.left >= br.right || r.right <= br.left) };
}));
check('hud: each banner shows its weapon symbol, outside the banner, sword tagged STRONG and axe WEAK',
  weaponBadges.length === 2 && weaponBadges[0].weapon === 'sword' && weaponBadges[0].tag === 'strong' && weaponBadges[1].weapon === 'axe' && weaponBadges[1].tag === 'weak' && weaponBadges.every((b) => b.svg && b.clear),
  JSON.stringify(weaponBadges));
check('polish: no console or HTTP errors', errors.length === 0, errors.join(' | '));

// ---- The card showcase (?mode=card): the layered, animated card --------------------------------
const cardErrors = errors.length;
/** Luminance mean and spread of a screen region, from a real screenshot of it. */
const regionStats = async (r) => {
  const b64 = await page.screenshot({ clip: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }, encoding: 'base64' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    const ls = [];
    for (let i = 0; i < d.length; i += 4) ls.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255);
    const mean = ls.reduce((s, l) => s + l, 0) / ls.length;
    const sd = Math.sqrt(ls.reduce((s, l) => s + (l - mean) ** 2, 0) / ls.length);
    return { mean: +mean.toFixed(3), sd: +sd.toFixed(3) };
  }, b64);
};
/** The card's art window on screen (its middle 80%, clear of the frame and medallions). */
const artRegion = async () => {
  const r = await page.evaluate(() => window.__card.rect());
  const s = r.width * 0.92;
  return { x: r.x + r.width * 0.04 + s * 0.1, y: r.y + r.height * (170 / 1400) + s * 0.1, width: s * 0.8, height: s * 0.8 };
};
await page.goto(`${url}?mode=card&id=long-road&clean=1`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__card?.ready, { timeout: 30000 });
await frames(10);
const cardLoaded = await page.evaluate(() => window.__card.loaded);
check('card: Long Road loads every art layer', ['layers.json', 'art.jpg', 'plate.jpg', 'character.webp', 'front.webp', 'depth.png'].every((f) => cardLoaded[f] === true), JSON.stringify(cardLoaded));
const artFront = await artRegion().then(regionStats);
check('card: the art window shows the art (not blank)', artFront.sd > 0.08 && artFront.mean > 0.15 && artFront.mean < 0.9, JSON.stringify(artFront));
await shot('18-card');
// Hover: the pointer over the card tilts it toward the pointer.
const cardRect = await page.evaluate(() => window.__card.rect());
const centre = { x: cardRect.x + cardRect.width / 2, y: cardRect.y + cardRect.height / 2 };
await page.mouse.move(centre.x + cardRect.width * 0.4, centre.y - cardRect.height * 0.4);
// Waits for the tilt to ease over and the clip to start, however fast the frames come (a slow
// machine draws few, and a fixed count of them could outlast the five-second clip).
await page.waitForFunction(() => { const t = window.__card.tilt(); const c = window.__card.clip(); return t.x > 0.3 && t.y > 0.3 && (!c.has || (c.playing && c.mix > 0)); }, { timeout: 15000 }).catch(() => {});
const hoverState = await page.evaluate(() => ({ hovered: window.__card.hovered(), tilt: window.__card.tilt(), clip: window.__card.clip() }));
check('card: hovering tilts the card toward the pointer', hoverState.hovered && hoverState.tilt.x > 0.3 && hoverState.tilt.y > 0.3, JSON.stringify(hoverState));
if (hoverState.clip.has) {
  check('card: hovering plays the clip', hoverState.clip.playing && hoverState.clip.mix > 0, JSON.stringify(hoverState.clip));
}
await page.mouse.move(5, 5);
await frames(60);
const leftState = await page.evaluate(() => ({ hovered: window.__card.hovered(), clip: window.__card.clip(), start: window.__card.params.clipStart }));
check('card: leaving the card stops hovering' + (leftState.clip.has ? ', and the clip fades out rewound' : ''),
  !leftState.hovered && (!leftState.clip.has || (leftState.clip.mix === 0 && !leftState.clip.playing && leftState.clip.time === leftState.start)), JSON.stringify(leftState));
// A click flips it to its back, and another back again.
await page.mouse.click(centre.x, centre.y);
await frames(90);
const backArt = await artRegion().then(regionStats);
const flippedOnce = await page.evaluate(() => window.__card.flipped());
await shot('19-card-back');
await page.mouse.click(centre.x, centre.y);
await frames(90);
const flippedTwice = await page.evaluate(() => window.__card.flipped());
check('card: a click flips it to its back (the art gone), and another back', flippedOnce && !flippedTwice && Math.abs(backArt.mean - artFront.mean) > 0.1, JSON.stringify({ flippedOnce, flippedTwice, artFront, backArt }));
// Every card in the game is listed as having art, and every file its layers.json names is there.
const artFiles = await page.evaluate(async () => {
  const root = `${location.origin}/cards/`;
  const listed = (await (await fetch(`${root}index.json`)).json()).cards;
  const missing = [];
  for (const id of listed) {
    const layers = await (await fetch(`${root}${id}/layers.json`)).json();
    for (const f of Object.values(layers).filter((v) => typeof v === 'string')) {
      const r = await fetch(`${root}${id}/${f}`, { method: 'HEAD' });
      if (!r.ok) missing.push(`${id}/${f}`);
    }
  }
  return { listed, missing };
});
const cardIds = ['long-road', 'swift-banner', 'scouts-path', 'open-field', 'iron-column', 'ember-rite', 'steady-line', 'cleavers-oath', 'shield-wall', 'thunder-hoof', 'grave-toll', 'kings-wager'];
check('card: all 12 cards are listed with art, and every layer file they name is there', cardIds.every((id) => artFiles.listed.includes(id)) && artFiles.missing.length === 0, JSON.stringify(artFiles));
// A card with no art yet still shows its frame and text, and asks for no missing files. Every card
// has art now, so the page is told none do: the card list comes back empty.
await page.setRequestInterception(true);
const noArt = (req) => (req.url().endsWith('/cards/index.json') ? req.respond({ status: 200, contentType: 'application/json', body: '{"cards":[]}' }) : req.continue());
page.on('request', noArt);
await page.goto(`${url}?mode=card&id=swift-banner&clean=1`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__card?.ready, { timeout: 30000 });
await frames(10);
const bare = await page.evaluate(() => ({ loaded: window.__card.loaded, rect: window.__card.rect() }));
const bareStats = await regionStats(bare.rect);
check('card: a card with no art renders its frame and asks for no missing files', bare.loaded['layers.json'] === false && bareStats.sd > 0.08, JSON.stringify({ bare, bareStats }));
await shot('20-card-no-art');
page.off('request', noArt);
await page.setRequestInterception(false);
check('card: no console or HTTP errors', errors.length === cardErrors, errors.slice(cardErrors).join(' | '));

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
