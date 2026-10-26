// The menu box on a 64×64 Wild Lands board, for evolution/land/m9-performance/menu.png.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173/?map=world&seed=99&size=64&weather=clear&time=day');
await page.waitForFunction(() => window.__map);
await new Promise((r) => setTimeout(r, 500));
const box = await (await page.$('#hud')).boundingBox();
await page.screenshot({ path: process.argv[2], clip: { x: 0, y: 0, width: box.x + box.width + 16, height: box.y + box.height + 16 } });
await browser.close();
