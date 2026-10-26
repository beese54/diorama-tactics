// Frame benchmark against the running dev server (npm run dev), on the RTX 4060.
// Usage: node tasks/perf/bench.mjs [label] [--uncapped] [--only=size:weather:time,...]
// Capped (default): the display's own rate; counts frames slower than 60 fps (16.7 ms).
// Uncapped: no vsync or frame limit, so frames per second shows the headroom.
import puppeteer from 'puppeteer-core';
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) ?? 'run';
const uncapped = args.includes('--uncapped');
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SEED = 4242;
const WARMUP_MS = 1500;
const SAMPLE_MS = 1000;
const SAMPLES = 10;

const cases = only?.map((c) => c.split(':')) ?? [
  ['32', 'clear', 'day'], ['32', 'storm', 'night'], ['32', 'snow', 'cycle'],
  ['64', 'clear', 'day'], ['64', 'storm', 'night'], ['64', 'snow', 'cycle'],
];

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--hide-scrollbars', ...(uncapped ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
const rows = [];
for (const [size, weather, time] of cases) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(`http://localhost:5173/?map=world&seed=${SEED}&size=${size}&weather=${weather}&time=${time}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map, { timeout: 600000, polling: 50 });
  const loadMs = Date.now() - t0;
  await new Promise((r) => setTimeout(r, WARMUP_MS));
  // Frame gaps from requestAnimationFrame, in one-second samples.
  const samples = await page.evaluate((count, ms) => new Promise((done) => {
    const out = [];
    let gaps = [];
    let last = performance.now();
    let sampleStart = last;
    const tick = (t) => {
      gaps.push(t - last);
      last = t;
      if (t - sampleStart >= ms) {
        out.push(gaps);
        gaps = [];
        sampleStart = t;
      }
      if (out.length < count) requestAnimationFrame(tick);
      else done(out);
    };
    requestAnimationFrame(tick);
  }), SAMPLES, SAMPLE_MS);
  const cpu = await page.evaluate(() => window.__map.takeFrameCpu());
  const all = samples.flat();
  const info = await page.evaluate(() => ({ ...window.__map.renderInfo(), ...window.__map.gpuMemory() }));
  const heap = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6));
  const row = {
    size, weather, time, loadMs,
    fps: median(samples.map((g) => g.length / (g.reduce((a, b) => a + b, 0) / 1000))),
    p99ms: +pct(all, 0.99).toFixed(1), worstMs: +Math.max(...all).toFixed(1), over16_7: all.filter((g) => g > 16.7).length,
    cpuMedian: +median(cpu).toFixed(2), cpuP99: +pct(cpu, 0.99).toFixed(2),
    calls: info.calls, triangles: info.triangles, heapMB: heap, errors: errors.length,
  };
  rows.push(row);
  console.log(JSON.stringify(row));
  await page.close();
}
await browser.close();
appendFileSync('tasks/perf/results.jsonl', rows.map((r) => JSON.stringify({ label, uncapped, ...r })).join('\n') + '\n');
