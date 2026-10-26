// Before/after load-time bars for evolution/land/m9-performance (palette checked with the dataviz validator, dark surface).
// Usage: node tasks/perf/chart.mjs <out.png>
import puppeteer from 'puppeteer-core';

const out = process.argv[2] ?? 'load-times.png';
// Medians of three interleaved rounds of 10 loads each (tasks/perf/loadtime.mjs), RTX 4060 laptop.
const ROWS = [
  { board: '32x32', before: 787, after: 429 },
  { board: '64x64', before: 2155, after: 919 },
];
const MAX = 2400;
const bar = (ms, cls) => `<div class="bar ${cls}" style="width:${(100 * ms) / MAX}%"></div><span class="value">${(ms / 1000).toFixed(2)} s</span>`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, defaultViewport: { width: 960, height: 400 } });
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>
  body { margin: 0; background: #0b0d14; font: 18px 'Silkscreen', monospace; color: #e8ecf8; }
  header { height: 48px; line-height: 48px; padding-left: 16px; background: linear-gradient(#34488a, #18224d); color: #ffe27a; font-size: 22px; }
  main { background: #141a2e; margin: 16px; padding: 20px 24px; border-radius: 4px; }
  .legend { display: flex; gap: 28px; margin-bottom: 18px; color: #b4bdd6; font-size: 15px; }
  .key { display: inline-block; width: 14px; height: 14px; border-radius: 3px; margin-right: 8px; vertical-align: -1px; }
  .row { display: grid; grid-template-columns: 110px 1fr; align-items: center; margin-bottom: 18px; }
  .label { color: #e8ecf8; }
  .track { position: relative; }
  .line { display: flex; align-items: center; gap: 10px; height: 26px; margin: 2px 0; }
  .bar { height: 22px; border-radius: 0 4px 4px 0; }
  .before { background: #6f86c9; }
  .after { background: #bd8619; }
  .value { color: #b4bdd6; font-size: 15px; white-space: nowrap; }
  .note { color: #8890a8; font-size: 13px; margin-top: 6px; }
</style></head><body>
<header>M9 · Time to load a board</header>
<main>
  <div class="legend"><span><span class="key before"></span>Before (M8)</span><span><span class="key after"></span>After (M9)</span></div>
  ${ROWS.map((r) => `<div class="row"><div class="label">${r.board}</div><div class="track">
    <div class="line">${bar(r.before, 'before')}</div>
    <div class="line">${bar(r.after, 'after')}</div>
  </div></div>`).join('')}
  <div class="note">Page open to board ready. Median of 30 loads, seed 4242. Both hold 60 fps at every size.</div>
</main>
</body></html>`, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const h = await page.evaluate(() => document.body.scrollHeight);
await page.setViewport({ width: 960, height: h });
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
