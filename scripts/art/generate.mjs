// Generates pose images through BytePlus ModelArk's image API (a Seedream model), from the
// prompts in scripts/art/prompts/*.json and their reference images in art/source/.
// Results land in art/source/candidates/ (git ignores art/source), never over your own files:
// pick the good ones and copy them into art/source/ yourself.
//
// The key comes from .env.local (git ignores it; .env.example shows the names) or the environment.
// It is sent only in the Authorization header to ARK_BASE_URL and never printed.
//
// Usage: node scripts/art/generate.mjs <prompts.json> <pose>... [--count N] [--size 2K] [--seed N] [--dry]
//   --dry prints what would be sent (without the key or the images' data) and spends nothing.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const SOURCE = 'art/source';
const OUT = join(SOURCE, 'candidates');

function env() {
  const vars = { ...process.env };
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && m[2] !== '') vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return vars;
}

function args(argv) {
  const opts = { count: 1, size: '2K', seed: undefined, dry: false, names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') opts.count = Number(argv[++i]);
    else if (a === '--size') opts.size = argv[++i];
    else if (a === '--seed') opts.seed = Number(argv[++i]);
    else if (a === '--dry') opts.dry = true;
    else opts.names.push(a);
  }
  return opts;
}

/** A reference image as a data URI, the form the API takes for local files. */
function dataUri(file) {
  const type = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' }[extname(file).toLowerCase()];
  if (!type) throw new Error(`unsupported reference image: ${file}`);
  return `data:image/${type};base64,${readFileSync(file).toString('base64')}`;
}

/** The first free candidate name: <out>-1.jpg, <out>-2.jpg, ... */
function nextFile(out, ext) {
  for (let n = 1; ; n++) {
    const file = join(OUT, `${out}-${n}${ext}`);
    if (!existsSync(file)) return file;
  }
}

const [promptsFile, ...rest] = process.argv.slice(2);
const opts = args(rest);
if (!promptsFile || !opts.names.length) throw new Error('usage: generate.mjs <prompts.json> <pose>... [--count N] [--size 2K] [--seed N] [--dry]');
const prompts = JSON.parse(readFileSync(promptsFile, 'utf8'));
const vars = env();
const base = (vars.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
if (!opts.dry) {
  if (!vars.ARK_API_KEY) throw new Error('ARK_API_KEY is not set: copy .env.example to .env.local and fill it in');
  if (!vars.ARK_IMAGE_MODEL) throw new Error('ARK_IMAGE_MODEL is not set in .env.local (a Seedream model ID or ep-... endpoint ID)');
}
mkdirSync(OUT, { recursive: true });

let failed = 0;
for (const name of opts.names) {
  const pose = prompts.poses[name];
  if (!pose) throw new Error(`no pose "${name}" in ${promptsFile}; it has: ${Object.keys(prompts.poses).join(', ')}`);
  const refs = pose.refs.map((r) => join(SOURCE, r));
  for (const r of refs) if (!existsSync(r)) throw new Error(`reference image missing: ${r}`);
  const body = {
    model: vars.ARK_IMAGE_MODEL ?? '(ARK_IMAGE_MODEL)',
    prompt: prompts.base.replace('{pose}', pose.pose),
    image: refs.length === 1 ? dataUri(refs[0]) : refs.map(dataUri),
    size: opts.size,
    sequential_image_generation: 'disabled',
    response_format: 'b64_json',
    watermark: false,
    ...(opts.seed === undefined ? {} : { seed: opts.seed }),
  };
  if (opts.dry) {
    console.log(`${name}: POST ${base}/images/generations`, JSON.stringify({ ...body, image: refs }, null, 1));
    continue;
  }
  for (let i = 0; i < opts.count; i++) {
    const res = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vars.ARK_API_KEY}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      failed++;
      console.error(`${name}: HTTP ${res.status}: ${text.slice(0, 600)}`);
      break;
    }
    const json = JSON.parse(text);
    for (const item of json.data ?? []) {
      if (item.error) {
        failed++;
        console.error(`${name}: ${JSON.stringify(item.error)}`);
        continue;
      }
      const bytes = Buffer.from(item.b64_json, 'base64');
      const ext = bytes[0] === 0x89 && bytes[1] === 0x50 ? '.png' : '.jpg';
      const file = nextFile(pose.out, ext);
      writeFileSync(file, bytes);
      console.log(`${name}: ${file} (${item.size ?? opts.size})`);
    }
  }
}
process.exit(failed ? 1 : 0);
