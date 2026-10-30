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
await page.click('#hud button');
await page.waitForFunction((s) => window.__map.seed() !== s, { timeout: 10000 }, regrown.seed).catch(() => {});
check('New map button grows another', (await page.evaluate(() => window.__map.seed())) !== regrown.seed);
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
check('world: a village rooftop can be picked, and the panel names it', onRoof?.x === roof.x && onRoof?.y === roof.y && /Roof/.test(roofPanel) && roofPanel.includes(`HT ${roof.height}`) && !roofPanel.includes('MOV --'), JSON.stringify({ roof, onRoof, roofPanel }));
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

// Skirmish: units deploy, a click selects one and marks exactly the rules' range, a click on a
// marked tile walks it there and spends the pool, it can't move twice, and Enter ends the turn.
errors.length = 0;
await page.goto(`${url}?map=meadow`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__map?.units());
const army = await page.evaluate(() => window.__map.units());
check('skirmish: five a side on the board', army.filter((u) => u.side === 'player').length === 5 && army.filter((u) => u.side === 'enemy').length === 5, JSON.stringify(army));
const clickTile = async (x, y) => {
  await page.evaluate((x, y) => window.__map.setPose(45, 55, 1.6, x, y), x, y);
  await frames();
  const pos = await page.evaluate((x, y) => window.__map.tileScreenPos(x, y), x, y);
  await page.mouse.click(pos.x, pos.y);
  await frames();
};
const mover = army[0];
await clickTile(mover.x, mover.y);
const marks = await page.evaluate(() => ({ selected: window.__map.selected(), marked: window.__map.marked() }));
check('skirmish: a click selects the unit and marks exactly its range', marks.selected === mover.id && marks.marked.reach > 1 && marks.marked.reach === marks.marked.rules, JSON.stringify(marks));
await shot('12-skirmish-select');
const reach = await page.evaluate(() => window.__map.reachable());
// With nothing selected there is nowhere to go: aim at the unit's own tile, so the walk check
// below fails with its details instead of the whole run stopping here.
const goal = reach.length ? reach.reduce((a, b) => (b[0] + b[1] < a[0] + a[1] ? b : a)) : [mover.x, mover.y];
await clickTile(goal[0], goal[1]);
await page.waitForFunction(() => !window.__map.busy(), { timeout: 20000 });
const after = await page.evaluate(() => ({ units: window.__map.units(), turn: window.__map.turn() }));
const moved = after.units.find((u) => u.id === mover.id);
check('skirmish: a click on a marked tile walks there and spends the pool', moved.x === goal[0] && moved.y === goal[1] && after.turn.pool < 12 && after.turn.moved.includes(mover.id), JSON.stringify({ goal, moved, turn: after.turn }));
await shot('13-skirmish-moved');
await clickTile(moved.x, moved.y);
check('skirmish: a unit that has moved gets no range', (await page.evaluate(() => window.__map.marked().reach)) === 0);
await page.keyboard.press('KeyX');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 200));
const turn2 = await page.evaluate(() => window.__map.turn());
check('skirmish: Enter ends the turn and the pool comes back', turn2.number === 2 && turn2.side === 'player' && turn2.pool === 12 && turn2.moved.length === 0, JSON.stringify(turn2));
const foe = army.find((u) => u.side === 'enemy');
await clickTile(foe.x, foe.y);
const foeMarks = await page.evaluate(() => window.__map.marked());
check('skirmish: a foe shows its reach in red and cannot be moved', foeMarks.foe > 1 && foeMarks.reach === 0, JSON.stringify(foeMarks));
check('skirmish: no console errors', errors.length === 0, errors.join(' | '));

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  -> ${r.detail}`}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
