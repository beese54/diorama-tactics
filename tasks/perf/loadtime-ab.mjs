// A/B load time: alternates two dev servers load by load, so background noise hits both alike.
// Usage: node tasks/perf/loadtime-ab.mjs <urlA> <urlB> [runs] [sizes...]
import puppeteer from 'puppeteer-core';
const [a, b, runsArg, ...sizesArg] = process.argv.slice(2);
const runs = Number(runsArg ?? 20);
const sizes = sizesArg.length ? sizesArg : ['32', '64'];
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const load = async (base, size) => {
  const t0 = Date.now();
  await page.goto(`${base}?map=world&seed=4242&size=${size}&weather=clear&time=day`);
  await page.waitForFunction(() => window.__map, { timeout: 600000, polling: 20 });
  return Date.now() - t0;
};
for (const base of [a, b]) await load(base, 16);
const median = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
for (const size of sizes) {
  const times = { [a]: [], [b]: [] };
  for (let i = 0; i < runs; i++) for (const base of i % 2 ? [b, a] : [a, b]) times[base].push(await load(base, size));
  const [ma, mb] = [median(times[a]), median(times[b])];
  // How often B beat the A load next to it.
  const wins = times[a].filter((t, i) => times[b][i] < t).length;
  console.log(`size ${size}: A ${ma} ms, B ${mb} ms (${(((mb - ma) / ma) * 100).toFixed(0)}%), B faster in ${wins}/${runs} pairs`);
}
await browser.close();
