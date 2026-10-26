// Load time, page open to board ready, N runs per size (modules warm), median and spread.
// Usage: node tasks/perf/loadtime.mjs [runs] [sizes...]   (BASE_URL=http://localhost:5174/ for another server)
import puppeteer from 'puppeteer-core';
const [runsArg, ...sizesArg] = process.argv.slice(2);
const runs = Number(runsArg ?? 10);
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const sizes = sizesArg.length ? sizesArg : ['32', '64'];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto(`${base}?map=world&seed=1&size=16`);
await page.waitForFunction(() => window.__map, { timeout: 600000 });
for (const size of sizes) {
  const ms = [];
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    await page.goto(`${base}?map=world&seed=4242&size=${size}&weather=clear&time=day`);
    await page.waitForFunction(() => window.__map, { timeout: 600000, polling: 20 });
    ms.push(Date.now() - t0);
  }
  ms.sort((a, b) => a - b);
  console.log(`size ${size}: median ${ms[Math.floor(runs / 2)]} ms, min ${ms[0]}, max ${ms[runs - 1]} (n=${runs})`);
}
await browser.close();
