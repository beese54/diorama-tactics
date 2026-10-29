// Records the round 2 animation test (?mode=anim) frame by frame at 24 fps, for the visual history
// in evolution/battles/: an MP4 at full resolution, a smaller GIF, and stills of the strike.
// Needs the dev server (npm run dev) and ffmpeg.
// Usage: node scripts/anim.mjs <outDir> [scene] [seconds] [char]   (scene: motion, win, lose, charge or video; default motion; char: aria, bram, corin or edric)
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outDir, scene = 'motion', secondsArg, char = 'aria'] = process.argv.slice(2);
if (!outDir) throw new Error('usage: anim.mjs <outDir> [scene] [seconds]');
mkdirSync(outDir, { recursive: true });
const FPS = 24;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });

async function open(dpr) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: dpr });
  await page.goto(`http://localhost:5173/?mode=anim&scene=${scene}&char=${char}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__anim?.ready, { timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, errors };
}

const { page, errors } = await open(1);
const info = await page.evaluate(() => ({ loop: window.__anim.loopSeconds, strike: window.__anim.strike }));
const seconds = Number(secondsArg) || 2 * info.loop;
const tmp = mkdtempSync(join(tmpdir(), 'anim-'));
const count = Math.round(seconds * FPS);
for (let i = 0; i < count; i++) {
  await page.evaluate((t) => window.__anim.at(t), i / FPS);
  await page.screenshot({ path: join(tmp, `f${String(i).padStart(4, '0')}.png`) });
}
const frames = join(tmp, 'f%04d.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', frames, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', join(outDir, 'compare.mp4')]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', frames, '-vf',
  'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[p];[b][p]paletteuse=dither=sierra2_4a', join(outDir, 'compare.gif')]);
// Stills: the wind-up and the strike, at 1x and as a 2x close-up.
for (const [name, t] of [['wind-up', info.strike - 0.15], ['strike', info.strike + 0.03]]) {
  await page.evaluate((s) => window.__anim.at(s), t);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
}
const close = await open(2);
await close.page.evaluate((s) => window.__anim.at(s), info.strike + 0.03);
await close.page.screenshot({ path: join(outDir, 'strike-2x.png') });
rmSync(tmp, { recursive: true, force: true });
await browser.close();
const all = [...errors, ...close.errors];
console.log(`${scene}: ${count} frames, ${seconds.toFixed(2)} s (longest loop ${info.loop.toFixed(2)} s)${all.length ? `  errors: ${all.join(' | ')}` : ''}`);
process.exit(all.length ? 1 : 0);
