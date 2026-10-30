// Records a whole battle (?mode=battle) frame by frame at 24 fps, for the visual history in
// evolution/battles/: an MP4 at full resolution and a small GIF, from the squads at rest to a
// moment after the result. Needs the dev server (npm run dev) and ffmpeg.
// Usage: node scripts/battlevideo.mjs <outDir> <name> <query> [keys]   (query e.g. a=sword&d=axe&seed=7;
// keys e.g. KeyA@3.5,KeyD@8: a key pressed at a second of the battle, to change the stance mid-battle)
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outDir, name, query, keys = ''] = process.argv.slice(2);
if (!outDir || !name || !query) throw new Error('usage: battlevideo.mjs <outDir> <name> <query>');
mkdirSync(outDir, { recursive: true });
const FPS = 24;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
// Opened still, so nothing is fought before the first frame.
await page.goto(`http://localhost:5173/?mode=battle&${query}&at=0`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__battle?.ready, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
const presses = keys ? keys.split(',').map((k) => { const [key, at] = k.split('@'); return { key, at: Number(at) }; }) : [];
// The whole battle, and a moment on the result. Its length is known only once the last key is
// pressed: asking plays the rest out with the stance as it is.
const tmp = mkdtempSync(join(tmpdir(), 'battle-'));
let seconds = Infinity;
let count = 0;
for (; count / FPS < seconds; count++) {
  const t = count / FPS;
  while (presses.length && presses[0].at <= t) await page.keyboard.press(presses.shift().key);
  if (!presses.length && seconds === Infinity) seconds = (await page.evaluate(() => window.__battle.length())) + 1.5;
  await page.evaluate((s) => window.__battle.at(s), t);
  await page.screenshot({ path: join(tmp, `f${String(count).padStart(4, '0')}.png`) });
}
const frames = join(tmp, 'f%04d.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', frames, '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', join(outDir, `${name}.mp4`)]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', frames, '-vf',
  'fps=10,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=sierra2_4a', join(outDir, `${name}.gif`)]);
rmSync(tmp, { recursive: true, force: true });
await browser.close();
console.log(`${name}: ${count} frames, ${seconds.toFixed(2)} s${errors.length ? `  errors: ${errors.join(' | ')}` : ''}`);
process.exit(errors.length ? 1 : 0);
