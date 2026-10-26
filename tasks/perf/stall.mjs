// Frame gaps on a big board, with the clock running and frozen (no liquid frame swaps).
import puppeteer from 'puppeteer-core';
const size = process.argv[2] ?? '96';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
await page.goto(`http://localhost:5173/?map=world&seed=4242&size=${size}&weather=clear&time=day`);
await page.waitForFunction(() => window.__map, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2000));
const gaps = (frozen) => page.evaluate((frozen) => new Promise((done) => {
  window.__map.setTime(frozen ? 3 : null);
  const ts = []; const start = performance.now();
  const tick = (t) => { ts.push(t); if (t - start < 6000) requestAnimationFrame(tick); else done(ts); };
  requestAnimationFrame(tick);
}).then((ts) => { const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => b - a); return { frames: ts.length, worst: d.slice(0, 5).map(Math.round), over50: d.filter((x) => x > 50).length }; }), frozen);
console.log('running', JSON.stringify(await gaps(false)));
console.log('frozen ', JSON.stringify(await gaps(true)));
console.log('gpu', JSON.stringify(await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e && gl.getParameter(e.UNMASKED_RENDERER_WEBGL); })));
await browser.close();
