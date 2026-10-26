// Frame gaps at a big board's minimum zoom, supersampled or not. Usage: node tasks/perf/zoomfps.mjs [rtx|intel] [size]
import puppeteer from 'puppeteer-core';
const [gpu = 'rtx', size = '64'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', ...(gpu === 'rtx' ? ['--force_high_performance_gpu'] : [])], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto(`http://localhost:5173/?map=world&seed=4242&size=${size}&weather=storm&time=night`);
await page.waitForFunction(() => window.__map);
for (const on of [false, true]) {
  await page.evaluate((on, s) => (window.__map.setSupersampling(on), window.__map.setPose(45, 60, window.__map.minZoom(), s / 2, s / 2)), on, Number(size));
  await new Promise((r) => setTimeout(r, 1500));
  const gaps = await page.evaluate(() => new Promise((done) => {
    const out = []; let last = performance.now(); const start = last;
    const tick = (t) => { out.push(t - last); last = t; if (t - start < 5000) requestAnimationFrame(tick); else done(out); };
    requestAnimationFrame(tick);
  }));
  const sorted = [...gaps].sort((a, b) => a - b);
  console.log(`${gpu} ${size} supersampling ${on ? 'on ' : 'off'}: ${(gaps.length / 5).toFixed(0)} fps, p99 ${sorted[Math.floor(gaps.length * 0.99)].toFixed(1)} ms, worst ${sorted[gaps.length - 1].toFixed(1)} ms, over 16.7 ms: ${gaps.filter((g) => g > 16.7).length}`);
}
await browser.close();
