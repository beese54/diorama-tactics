// Live memory after loading one board, by the source line that allocated it (sampling heap profile).
// Usage: node tasks/perf/profile-heap.mjs [size]
import puppeteer from 'puppeteer-core';
const size = process.argv[2] ?? '64';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu', '--js-flags=--expose-gc'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096 });
await page.goto(`http://localhost:5173/?map=world&seed=4242&size=${size}&weather=clear&time=day`);
await page.waitForFunction(() => window.__map, { timeout: 600000, polling: 50 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => window.gc?.());
const { profile } = await cdp.send('HeapProfiler.stopSampling');
const heap = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6));
const bySite = new Map();
const walk = (n, stack) => {
  const f = n.callFrame;
  const here = f.url.includes('/src/') ? `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '')}:${f.lineNumber + 1}` : null;
  const site = here ?? stack;
  if (n.selfSize) bySite.set(site ?? '(other)', (bySite.get(site ?? '(other)') ?? 0) + n.selfSize);
  for (const c of n.children) walk(c, site);
};
walk(profile.head, null);
const total = [...bySite.values()].reduce((a, b) => a + b, 0);
console.log(`size ${size}: heap ${heap} MB, sampled live ${(total / 1e6).toFixed(0)} MB`);
for (const [k, b] of [...bySite].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`${(b / 1e6).toFixed(1).padStart(6)} MB  ${k}`);
await browser.close();
