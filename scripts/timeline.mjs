// Rebuilds evolution/land/timeline.gif from evolution/land/stages.json: one captioned frame per
// visual stage (milestones, review rounds and fixes), oldest first, so the whole history plays
// as one loop. Run it whenever a stage is added. Needs ffmpeg on PATH (or FFMPEG_PATH).
// Usage: node scripts/timeline.mjs [seconds per stage]
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [hold = '1.6'] = process.argv.slice(2);
const root = 'evolution/land';
const stages = JSON.parse(readFileSync(join(root, 'stages.json'), 'utf8')).stages;
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const esc = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, defaultViewport: { width: 960, height: 540 } });
const page = await browser.newPage();
const dir = mkdtempSync(join(tmpdir(), 'timeline-'));
for (const [k, stage] of stages.entries()) {
  const image = `data:image/png;base64,${readFileSync(join(root, stage.image)).toString('base64')}`;
  await page.setContent(`<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>
  body { margin: 0; width: 960px; height: 540px; overflow: hidden; background: #0b0d14; font: 18px 'Silkscreen', monospace; }
  img { position: absolute; inset: 0; width: 960px; height: 540px; object-fit: contain; image-rendering: pixelated; }
  .bar { position: absolute; left: 16px; right: 16px; bottom: 16px; padding: 8px 14px; color: #ffe27a;
         background: linear-gradient(#34488a, #18224d); border: 2px solid #c9d4f0; border-radius: 4px; }
  .note { color: #e8eefc; font-size: 14px; margin-top: 4px; }
  .step { float: right; color: #c9d4f0; }
</style></head><body>
<img src="${image}">
<div class="bar"><span class="step">${k + 1} / ${stages.length} · ${esc(stage.date)}</span>${esc(stage.title)}<div class="note">${esc(stage.note)}</div></div>
</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(dir, `f${String(k).padStart(3, '0')}.png`) });
}
await browser.close();

const out = join(root, 'timeline.gif');
execFileSync(ffmpeg, [
  '-y', '-loglevel', 'error', '-framerate', String(1 / Number(hold)), '-i', join(dir, 'f%03d.png'),
  '-vf', 'fps=10,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none',
  '-loop', '0', out,
]);
rmSync(dir, { recursive: true, force: true });
console.log(`wrote ${out} (${stages.length} stages, ${hold} s each)`);
