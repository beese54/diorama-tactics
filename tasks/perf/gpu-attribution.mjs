// GPU time per frame (timer queries) on a board, all layers on and then each layer off in turn.
// Usage: node tasks/perf/gpu-attribution.mjs [rtx|intel] [size] [weather] [time] [zoom: default|min]
import puppeteer from 'puppeteer-core';
const [gpu = 'intel', size = '64', weather = 'clear', time = 'day', zoomArg = 'default'] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-angle=d3d11', '--disable-frame-rate-limit', '--disable-gpu-vsync', ...(gpu === 'rtx' ? ['--force_high_performance_gpu'] : [])],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.goto(`http://localhost:5173/?map=world&seed=4242&size=${size}&weather=${weather}&time=${time}`);
await page.waitForFunction(() => window.__map);
if (zoomArg === 'min') await page.evaluate((s) => window.__map.setPose(45, 60, window.__map.minZoom(), s / 2, s / 2), Number(size));
await new Promise((r) => setTimeout(r, 1500));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const measure = async () => {
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => window.__map.takeGpuTimes());
  await new Promise((r) => setTimeout(r, 1500));
  return median(await page.evaluate(() => window.__map.takeGpuTimes()));
};
const all = [];
for (let i = 0; i < 3; i++) all.push(await measure());
const base = median(all);
console.log(`${gpu} ${size} ${weather} ${time} zoom ${zoomArg}: all layers ${base.toFixed(2)} ms/frame (runs ${all.map((x) => x.toFixed(2)).join(', ')})`);
for (const layer of ['shadows', 'mesh', 'flora', 'props', 'weather', 'ambience', 'backdrop']) {
  await page.evaluate((l) => window.__map.setLayer(l, false), layer);
  const without = await measure();
  await page.evaluate((l) => window.__map.setLayer(l, true), layer);
  console.log(`  without ${layer.padEnd(9)} ${without.toFixed(2)} ms  -> ${layer} costs ${(base - without).toFixed(2)} ms (${((100 * (base - without)) / base).toFixed(0)}%)`);
}
await browser.close();
