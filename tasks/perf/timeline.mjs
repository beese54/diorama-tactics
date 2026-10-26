// Where a board's load time goes: main-thread marks and each worker job (posted, run, received), in ms since page open.
// Usage: node tasks/perf/timeline.mjs [size] [runs]
import puppeteer from 'puppeteer-core';
const size = process.argv[2] ?? '64';
const runs = Number(process.argv[3] ?? 3);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=d3d11', '--force_high_performance_gpu'], defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
await page.goto('http://localhost:5173/?map=world&seed=1&size=16');
await page.waitForFunction(() => window.__map);
for (let i = 0; i < runs; i++) {
  await page.goto(`http://localhost:5173/?map=world&seed=4242&size=${size}&weather=clear&time=day`);
  await page.waitForFunction(() => window.__map, { polling: 20 });
  const { marks, jobs } = await page.evaluate(() => window.__map.loadTimeline());
  console.log(`run ${i + 1}: ${marks.map(([n, t]) => `${n.replace('board', '')} ${t}`).join(' | ')}`);
  for (const j of jobs) console.log(`   ${j.kind.padEnd(8)} posted ${j.posted}  ran ${j.started}-${j.finished} (${j.finished - j.started} ms)  received ${j.received}`);
}
await browser.close();
