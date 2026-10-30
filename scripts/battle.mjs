// Photographs the battle scene at full resolution for the visual history in evolution/battles/,
// and checks it is drawn at the device's full resolution (not the map's 480x270).
// Needs the dev server (npm run dev).
// Usage: node scripts/battle.mjs <outDir> [width height dpr]... [--q a=<class>&d=<class>]   (default 1920 1080 1; sword against axe)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const qi = argv.indexOf('--q');
const query = qi >= 0 ? argv.splice(qi, 2)[1] : '';
const [outDir, ...rest] = argv;
if (!outDir) throw new Error('usage: battle.mjs <outDir> [width height dpr]...');
mkdirSync(outDir, { recursive: true });
const sizes = [];
for (let i = 0; i + 2 < rest.length + 1 && rest.length; i += 3) sizes.push(rest.slice(i, i + 3).map(Number));
if (!sizes.length) sizes.push([1920, 1080, 1]);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
let ok = true;
for (const [width, height, dpr] of sizes) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width, height, deviceScaleFactor: dpr });
  await page.goto(`http://localhost:5173/?mode=battle${query ? `&${query}` : ''}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__battle?.ready, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  // A fixed moment, so the breathing is the same in every shot.
  await page.evaluate(() => window.__battle.at?.(0.4));
  await new Promise((r) => setTimeout(r, 500));
  const c = await page.evaluate(() => window.__battle.canvas());
  const full = c.w === Math.round(c.cssW * c.dpr) && c.h === Math.round(c.cssH * c.dpr) && c.cssW === width;
  ok &&= full && !errors.length;
  console.log(`${full ? 'PASS' : 'FAIL'}  ${width}x${height} @${dpr}x: drawing buffer ${c.w}x${c.h} for ${c.cssW}x${c.cssH} css${errors.length ? `  errors: ${errors.join(' | ')}` : ''}`);
  const tag = query ? `-${query.replace(/[a-z]=/g, '').replace('&', '-v-')}` : '';
  await page.screenshot({ path: join(outDir, `battle${tag}-${width}x${height}@${dpr}x.png`) });
  await page.close();
}
await browser.close();
process.exit(ok ? 0 : 1);
