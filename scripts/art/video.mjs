// Makes clips through BytePlus ModelArk's video API (a Seedance 2.0 model), image to video from a
// first and a last frame, from the clips in scripts/art/prompts/clips.json. Results land in
// art/source/candidates/<out>-<model>-<n>.mp4 (git ignores art/source).
//
// Every clip is priced first and refused if it would take the round past ARK_CAP_USD; the real
// cost, from the task's usage, goes into art/source/spend.json (see spend.mjs). Failed tasks
// aren't billed and are recorded at $0.
//
// The key comes from .env.local and is sent only in the Authorization header; it is never printed.
//
// Usage: node scripts/art/video.mjs <clips.json> <clip>... [--model mini|fast|2.0] [--seed N] [--dry]
//   --dry prints what would be sent (without the images' data), its price, and spends nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { VIDEO_MODELS, env, estimate, guard, record, summary, videoCost } from './spend.mjs';

const OUT = 'art/source/candidates';
const POLL_MS = 10_000;
const WAIT_MS = 10 * 60_000;

function args(argv) {
  const opts = { model: 'mini', seed: undefined, dry: false, names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') opts.model = argv[++i];
    else if (a === '--seed') opts.seed = Number(argv[++i]);
    else if (a === '--dry') opts.dry = true;
    else opts.names.push(a);
  }
  return opts;
}

function dataUri(file) {
  const type = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' }[extname(file).toLowerCase()];
  if (!type) throw new Error(`unsupported frame image: ${file}`);
  return `data:image/${type};base64,${readFileSync(file).toString('base64')}`;
}

function nextFile(out) {
  for (let n = 1; ; n++) {
    const file = join(OUT, `${out}-${n}.mp4`);
    if (!existsSync(file)) return file;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [clipsFile, ...rest] = process.argv.slice(2);
const opts = args(rest);
if (!clipsFile || !opts.names.length) throw new Error('usage: video.mjs <clips.json> <clip>... [--model mini|fast|2.0] [--seed N] [--dry]');
const model = VIDEO_MODELS[opts.model];
if (!model) throw new Error(`unknown --model ${opts.model}; known: ${Object.keys(VIDEO_MODELS).join(', ')}`);
const clips = JSON.parse(readFileSync(clipsFile, 'utf8'));
const vars = env();
const base = (vars.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
if (!opts.dry && !vars.ARK_API_KEY) throw new Error('ARK_API_KEY is not set in .env.local');
mkdirSync(OUT, { recursive: true });
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${vars.ARK_API_KEY}` };

let failed = 0;
for (const name of opts.names) {
  const clip = clips.clips[name];
  if (!clip) throw new Error(`no clip "${name}" in ${clipsFile}; it has: ${Object.keys(clips.clips).join(', ')}`);
  const first = clip.first;
  const last = clip.last ?? clip.first;
  for (const f of [first, last]) {
    if (existsSync(f)) continue;
    if (!opts.dry) throw new Error(`frame image missing: ${f}`);
    console.log(`${name}: (dry) frame image not made yet: ${f}`);
  }
  const seconds = clip.seconds ?? clips.seconds ?? 5;
  const resolution = clip.resolution ?? clips.resolution ?? '720p';
  const price = estimate('video', { model: opts.model, seconds, resolution });
  const body = {
    model: model.id,
    content: [
      { type: 'text', text: clip.prompt },
      { type: 'image_url', image_url: { url: opts.dry ? first : dataUri(first) }, role: 'first_frame' },
      { type: 'image_url', image_url: { url: opts.dry ? last : dataUri(last) }, role: 'last_frame' },
    ],
    ratio: '1:1',
    resolution,
    duration: seconds,
    generate_audio: false,
    watermark: false,
    ...(opts.seed === undefined ? {} : { seed: opts.seed }),
  };
  if (opts.dry) {
    const shown = { ...body, content: [body.content[0], { role: 'first_frame', file: first }, { role: 'last_frame', file: last }] };
    console.log(`${name}: POST ${base}/contents/generations/tasks`, JSON.stringify(shown, null, 1));
    console.log(`${name}: ${opts.model}, ${seconds} s ${resolution}: about $${price.toFixed(3)}`);
    continue;
  }
  guard(vars, price);
  const res = await fetch(`${base}/contents/generations/tasks`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  const text = await res.text();
  if (!res.ok) {
    failed++;
    console.error(`${name}: HTTP ${res.status}: ${text.slice(0, 600)}`);
    continue;
  }
  const { id } = JSON.parse(text);
  console.log(`${name}: task ${id} (${opts.model}), about $${price.toFixed(3)}`);
  // The task is billed only if it succeeds, so until then it is recorded at its estimate in
  // memory only; the ledger gets the real figure once the task ends.
  let task;
  const start = Date.now();
  for (;;) {
    await sleep(POLL_MS);
    try {
      const r = await fetch(`${base}/contents/generations/tasks/${id}`, { headers, signal: AbortSignal.timeout(60_000) });
      task = JSON.parse(await r.text());
    } catch (e) {
      console.error(`${name}: poll failed (${e.cause?.code ?? e.message}), trying again`);
      continue;
    }
    if (['succeeded', 'failed', 'cancelled', 'expired'].includes(task.status)) break;
    if (Date.now() - start > WAIT_MS) {
      // Still running: it may yet succeed and be billed, so it is recorded at its estimate.
      failed++;
      record({ kind: 'video', model: model.id, name, task: id, status: 'timed out', estimate: price });
      console.error(`${name}: still ${task.status} after ${WAIT_MS / 60_000} minutes; recorded at its estimate. Fetch it later with task ${id}.`);
      task = null;
      break;
    }
  }
  if (!task) continue;
  if (task.status !== 'succeeded') {
    failed++;
    record({ kind: 'video', model: model.id, name, task: id, status: task.status, estimate: price, cost: 0 });
    console.error(`${name}: ${task.status}: ${JSON.stringify(task.error ?? {}).slice(0, 400)}`);
    continue;
  }
  const tokens = task.usage?.completion_tokens;
  const cost = tokens === undefined ? price : videoCost(opts.model, tokens);
  const file = nextFile(`${clip.out}-${opts.model}`);
  const video = await fetch(task.content.video_url, { signal: AbortSignal.timeout(120_000) });
  writeFileSync(file, Buffer.from(await video.arrayBuffer()));
  record({ kind: 'video', model: model.id, name, task: id, status: 'succeeded', seed: task.seed, tokens, estimate: price, cost, file });
  console.log(`${name}: ${file}, ${tokens} tokens, $${cost.toFixed(3)} (seed ${task.seed}); ${summary(vars)}`);
}
if (opts.dry) console.log(summary(vars));
process.exitCode = failed ? 1 : 0;
