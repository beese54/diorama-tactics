// Encodes the user's music for the game (B8): node scripts/art/music.mjs
// Reads art/source/music/{map,battle,victory,defeat}.{mp3,wav,m4a,ogg} (generated from the
// prompts in scripts/art/prompts/music.md; art/source is not committed), trims leading and
// trailing silence, evens the loudness (EBU R128, -16 LUFS), encodes 44.1 kHz stereo MP3 at
// 160 kb/s into public/audio/music/<name>.mp3, and lists what it wrote in index.json, which is
// what the game reads to know which tracks exist.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const SRC = 'art/source/music';
const OUT = 'public/audio/music';
const TRACKS = ['map', 'battle', 'victory', 'defeat'];
const KINDS = ['mp3', 'wav', 'm4a', 'ogg'];

mkdirSync(OUT, { recursive: true });
const listed = new Set(existsSync(join(OUT, 'index.json')) ? JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8')).tracks ?? [] : []);
for (const track of TRACKS) {
  const kind = KINDS.find((k) => existsSync(join(SRC, `${track}.${k}`)));
  if (!kind) {
    console.log(`${track}: no file in ${SRC}`);
    continue;
  }
  const out = join(OUT, `${track}.mp3`);
  // Silence trimmed from both ends (by trimming, reversing, trimming again), loudness evened.
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(SRC, `${track}.${kind}`), '-af', `${trim},areverse,${trim},areverse,loudnorm=I=-16:TP=-1.5:LRA=11`,
    '-ar', '44100', '-ac', '2', '-b:a', '160k', out]);
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
  listed.add(track);
  console.log(`${track}: ${out} (${seconds.toFixed(1)} s)`);
}
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ tracks: TRACKS.filter((t) => listed.has(t)) }, null, 1)}\n`);
console.log(`listed: ${[...listed].join(', ') || 'none'}`);
