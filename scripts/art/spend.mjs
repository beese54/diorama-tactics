// The spending guard shared by generate.mjs (images) and video.mjs (clips): what a call costs,
// whether the round's cap allows it, and a ledger of what was spent.
//
// The cap is ARK_CAP_USD in .env.local (git ignores it). With no cap set, nothing may be spent.
// The ledger is art/source/spend.json (git ignores art/source). `before` holds what was spent
// before the ledger began; it doesn't count against the cap, which covers this round only.
//
// Prices are BytePlus ModelArk's list prices (checked 2026-11-01).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const LEDGER = 'art/source/spend.json';

/** .env.local's values, under the real environment's (so ARK_CAP_USD=0.01 node ... overrides the file). The key is never printed. */
export function env() {
  const vars = {};
  if (existsSync('.env.local')) {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && m[2] !== '') vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...vars, ...process.env };
}

/** Seedream 5.0 Pro: an image up to 2.61 MP; the first reference image is free, each further one costs extra. */
export const IMAGE_PRICE = 0.045;
export const EXTRA_REF_PRICE = 0.003;

/**
 * Video models by short name: the API's model id, and USD per million output tokens. A 5 s 1:1
 * 720p clip is 5 × 960 × 960 × 24 / 1024 = 108,000 tokens; the rates give that clip the list
 * price (Mini $0.38, Fast $0.60, 2.0 $0.76).
 */
export const VIDEO_MODELS = {
  mini: { id: 'dreamina-seedance-2-0-mini-260615', perMillion: 0.38 / 0.108 },
  fast: { id: 'dreamina-seedance-2-0-fast-260128', perMillion: 0.6 / 0.108 },
  '2.0': { id: 'dreamina-seedance-2-0-260128', perMillion: 0.76 / 0.108 },
};

/** Output pixels for each resolution at 1:1 (the same count as 16:9 at that resolution). */
const SQUARE = { '480p': 640, '720p': 960 };

export const videoTokens = (seconds, resolution, fps = 24) => {
  const side = SQUARE[resolution];
  if (!side) throw new Error(`no price known for resolution ${resolution}`);
  return (seconds * side * side * fps) / 1024;
};

/** The estimated price of one call, in USD. */
export function estimate(kind, opts) {
  if (kind === 'image') return IMAGE_PRICE + EXTRA_REF_PRICE * Math.max(0, (opts.refs ?? 0) - 1);
  if (kind === 'video') {
    const model = VIDEO_MODELS[opts.model];
    if (!model) throw new Error(`no price known for video model "${opts.model}"; known: ${Object.keys(VIDEO_MODELS).join(', ')}`);
    return (videoTokens(opts.seconds, opts.resolution) * model.perMillion) / 1e6;
  }
  throw new Error(`unknown kind ${kind}`);
}

/** The cost of a finished video from its usage, in USD. */
export const videoCost = (model, completionTokens) => (completionTokens * VIDEO_MODELS[model].perMillion) / 1e6;

export function load() {
  if (!existsSync(LEDGER)) return { before: 11.6, entries: [] };
  return JSON.parse(readFileSync(LEDGER, 'utf8'));
}

/** What this round has spent so far: the real cost where known, else the estimate. */
export const total = (ledger = load()) => ledger.entries.reduce((s, e) => s + (e.cost ?? e.estimate), 0);

/** The cap from the environment, in USD, or 0 (nothing allowed) if unset or invalid. */
export function cap(vars) {
  const c = Number(vars.ARK_CAP_USD);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/** Throws unless spending `cost` more keeps the round within the cap. */
export function guard(vars, cost) {
  const limit = cap(vars);
  const spent = total();
  if (!limit) throw new Error('ARK_CAP_USD is not set in .env.local: no spending without a cap');
  if (spent + cost > limit + 1e-9) {
    throw new Error(`refused: $${cost.toFixed(3)} more would take the round to $${(spent + cost).toFixed(3)}, past the $${limit.toFixed(2)} cap (spent $${spent.toFixed(3)})`);
  }
  return { spent, limit };
}

/** Appends one call to the ledger. */
export function record(entry) {
  const ledger = load();
  ledger.entries.push({ at: new Date().toISOString(), ...entry });
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');
  return total(ledger);
}

/** A one-line summary of the round's spending. */
export function summary(vars) {
  const limit = cap(vars);
  return `round spent $${total().toFixed(3)} of the $${limit.toFixed(2)} cap${limit ? '' : ' (ARK_CAP_USD not set)'}`;
}
