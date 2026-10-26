// Four overviews in a 2×2 sheet with a title bar over each, like the M11/M12 sheets.
// Usage: node tasks/perf/sheet.mjs <out.png> <dir:Title> <dir:Title> <dir:Title> <dir:Title>
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const [out, ...items] = process.argv.slice(2);
const cells = items.map((item) => {
  const [dir, title] = item.split(':');
  return `<div class="cell"><div class="bar">${title}</div><img src="data:image/png;base64,${readFileSync(`${dir}/overview.png`).toString('base64')}"></div>`;
});
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, defaultViewport: { width: 1920, height: 1176 } });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>
  body { margin: 0; display: grid; grid-template-columns: 960px 960px; background: #0b0d14; }
  .cell { width: 960px; height: 588px; }
  .bar { height: 48px; display: flex; align-items: center; padding: 4px 0 0 18px; box-sizing: border-box; color: #ffe27a; font: 18px 'Silkscreen', monospace; letter-spacing: 2px;
         background: linear-gradient(#34488a, #18224d); text-transform: uppercase; }
  img { display: block; width: 960px; height: 540px; image-rendering: pixelated; }
</style></head><body>${cells.join('')}</body></html>`, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
