// Draws every unit's map sprite (idle, walk and rest frames) magnified on grass, for close-up review.
// Needs the dev server (npm run dev). Usage: node scripts/unitsheet.mjs <out.png> [scale]
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const [out, scale = "6"] = process.argv.slice(2);
const SCALE = Number(scale);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173/?map=meadow&mode=view', { waitUntil: 'load' });
const data = await page.evaluate(async (SCALE) => {
  const { buildUnitSheet, lookOf } = await import('/src/units/unitSprites.ts');
  const { ROSTER } = await import('/src/game/deploy.ts');
  const { makeUnit } = await import('/src/game/units.ts');
  const units = [...ROSTER.player.map((r, i) => makeUnit({ id: 'p' + i, side: 'player', x: 0, y: 0, ...r })), ...ROSTER.enemy.map((r, i) => makeUnit({ id: 'e' + i, side: 'enemy', x: 0, y: 0, ...r }))];
  const sheet = buildUnitSheet(units.map(lookOf));
  const src = sheet.texture.image;
  const S = SCALE, CW = 21, CH = 27;
  const c = document.createElement('canvas');
  c.width = 7 * CW * S + 20; c.height = 10 * CH * S;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.fillStyle = '#7a9552'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, 0, 0, 7 * CW, 10 * CH, 0, 0, 7 * CW * S, 10 * CH * S);
  return c.toDataURL('image/png');
}, SCALE);
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
