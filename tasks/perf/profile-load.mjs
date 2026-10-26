// CPU profile of loading one board: self time per function, and total time per source file.
// Usage: node tasks/perf/profile-load.mjs [size] [extra query]
import puppeteer from 'puppeteer-core';
const size = process.argv[2] ?? '64';
const extra = process.argv[3] ?? '';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await page.goto('about:blank');
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
// Warm the module cache so the profile is the board build, not Vite's transforms.
await page.goto(`http://localhost:5173/?map=world&seed=1&size=16`);
await page.waitForFunction(() => window.__map, { timeout: 600000 });
await cdp.send('Profiler.start');
const t0 = Date.now();
await page.goto(`http://localhost:5173/?map=world&seed=4242&size=${size}&weather=clear&time=day${extra}`);
await page.waitForFunction(() => window.__map, { timeout: 600000, polling: 50 });
const wall = Date.now() - t0;
const { profile } = await cdp.send('Profiler.stop');
const dt = profile.timeDeltas;
const selfUs = new Map();
profile.samples.forEach((id, i) => selfUs.set(id, (selfUs.get(id) ?? 0) + (dt[i] ?? 0)));
const byFn = new Map();
const byFile = new Map();
for (const n of profile.nodes) {
  const us = selfUs.get(n.id) ?? 0;
  const file = n.callFrame.url.replace(/^.*\/src\//, 'src/').replace(/\?.*$/, '') || '(native)';
  const key = `${n.callFrame.functionName || '(anon)'} ${file}:${n.callFrame.lineNumber + 1}`;
  byFn.set(key, (byFn.get(key) ?? 0) + us);
  byFile.set(file, (byFile.get(file) ?? 0) + us);
}
const total = [...byFn.values()].reduce((a, b) => a + b, 0);
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(6)} ms ${((100 * us) / total).toFixed(1).padStart(5)}%  ${k}`).join('\n');
console.log(`size ${size}: wall ${wall} ms, sampled ${(total / 1000).toFixed(0)} ms\n-- by file\n${top(byFile, 14)}\n-- by function (self)\n${top(byFn, 22)}`);
await browser.close();
