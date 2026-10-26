// One still of a map at a pose and a frozen time. Usage: node tasks/perf/still.mjs <out.png> <query> [az polar zoom x y] [seconds]
import puppeteer from 'puppeteer-core';
const [out, query, az = 45, polar = 55, zoom = 2.2, x, y, seconds = 30] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--hide-scrollbars'], defaultViewport: { width: 960, height: 540 } });
const page = await browser.newPage();
await page.goto(`http://localhost:5173/?${query}`);
await page.waitForFunction(() => window.__map);
await page.evaluate(() => document.getElementById('hud')?.setAttribute('hidden', ''));
await page.evaluate((s) => window.__map.setTime(+s), seconds);
const w = await page.evaluate(() => window.__map.theme().width);
await page.evaluate((p) => window.__map.setPose(...p), [+az, +polar, +zoom, x === undefined ? w / 2 : +x, y === undefined ? w / 2 : +y]);
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: out });
await browser.close();
