// Puts two pictures side by side with labels, for the before/after of a review round in evolution/.
// Usage: node scripts/compare.mjs <out.png> <before.png> <after.png> ["Before" label] ["After" label]
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const [out, before, after, beforeLabel = 'Before', afterLabel = 'After'] = process.argv.slice(2);
if (!out || !before || !after) throw new Error('usage: node scripts/compare.mjs <out.png> <before.png> <after.png> [before label] [after label]');
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const src = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const esc = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: 1920, height: 588 } });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>
  body { margin: 0; background: #0b0d14; display: flex; font: 22px 'Silkscreen', monospace; color: #ffe27a; }
  figure { margin: 0; width: 960px; }
  figcaption { height: 48px; line-height: 48px; padding-left: 16px; background: linear-gradient(#34488a, #18224d); }
  img { display: block; width: 960px; height: 540px; object-fit: contain; image-rendering: pixelated; background: #0b0d14; }
</style></head><body>
<figure><figcaption>${esc(beforeLabel)}</figcaption><img src="${src(before)}"></figure>
<figure><figcaption>${esc(afterLabel)}</figcaption><img src="${src(after)}"></figure>
</body></html>`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
