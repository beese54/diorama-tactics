import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import { mistLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 137;
/** The landmark: a shepherd's bothy on a rise at the back of the moor. */
const BOTHY: [number, number] = [14, 5];

/** Dry-stone walls, each with a gap for a gateway: one along the back-left field, one down the right. */
const WALLS = new Set([
  ...[0, 1, 2, 3, 4, 6, 7, 8, 9].map((x) => `${x},8`),
  ...[10, 11, 12, 13, 14, 16, 17, 18, 19].map((y) => `11,${y}`),
]);
/** Peat pools in the hollows: centre and radius. */
const POOLS: [number, number, number][] = [[4.5, 13.5, 1.9], [16.5, 15.5, 1.9], [8, 3.5, 1.5]];
/** The track from the front-left corner up to the bothy. */
const TRACK: [number, number][] = [[1, 19], [4, 15], [7, 11], [9, 9], [12, 6], [14, 6]];
const GORSE = new Set(['2,3', '3,2', '1,4', '17,10', '18,12', '16,11', '6,17', '7,18', '14,13']);
const SHEEP = new Set(['3,11', '9,14', '15,18', '10,4', '18,8', '6,6']);

function trackDistance(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < TRACK.length - 1; i++) {
    const [ax, ay] = TRACK[i];
    const [bx, by] = TRACK[i + 1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
  }
  return best;
}

/** Rolling moorland: two octaves of noise, with the bothy's rise lifting the back right. */
function ground(x: number, y: number): number {
  const roll = 0.65 * valueNoise(SEED, x / 4.5, y / 4.5) + 0.35 * valueNoise(SEED + 1, x / 2, y / 2);
  const rise = Math.max(0, 1.8 - Math.hypot(x - BOTHY[0], y - BOTHY[1]) / 3);
  return Math.max(1, Math.min(5, 1 + Math.floor(roll * 3.4 + rise)));
}

function place(x: number, y: number): Cell {
  const key = `${x},${y}`;
  for (const [px, py, r] of POOLS) {
    // Measured from tile centres, with a wobble, so pools come out as rounded blobs.
    const d = Math.hypot(x + 0.5 - px, y + 0.5 - py) + 0.5 * (valueNoise(SEED ^ 0x9e, x / 1.5, y / 1.5) - 0.5);
    if (d < r) return { terrain: 'shallow_water', height: 1, water: { kind: 'lake', flow: [0, 0] } };
    if (d < r + 1.1) return { terrain: 'bog', height: 2 };
  }
  const height = ground(x, y);
  if (x === BOTHY[0] && y === BOTHY[1]) return { terrain: 'moor_grass', height, prop: 'bothy' };
  if (WALLS.has(key)) return { terrain: 'drystone', height: height + 1 };
  if (trackDistance(x + 0.5, y + 0.5) < 0.6) return { terrain: 'road', height };
  const heather = valueNoise(SEED ^ 0x4ea, x / 2.6, y / 2.6) > 0.52;
  const prop = GORSE.has(key) ? 'gorse' : SHEEP.has(key) ? 'sheep' : undefined;
  return { terrain: heather ? 'heather' : 'moor_grass', height, prop };
}

export const moor: Theme = {
  id: 'moor',
  name: 'Highland Moor',
  category: 'Wilds',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    return map;
  },
  focus: BOTHY,
  zoom: 0.85,
  light: {
    background: '#d8b8b8', sky: '#f0d0d8', bounce: '#5a4a5a', ambient: 1.35,
    sun: '#ffc890', sunIntensity: 2.1, sunFrom: [-8, 4, 2], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#3a4a7a'], [100, '#8a7aa8'], [170, '#e8a890'], [215, '#f4c8a0'], [269, '#f0d4b0']]);
    far.sun(1100, 196, 11, '#ffe6b8', 3);
    far.ridge({ seed: 21, base: 214, amp: 60, period: 4, color: '#7a6a8a', shade: '#6a5a7a', jag: 0.05 });
    far.mist(196, 34, '#f0c8b0', 0.45);
    far.ridge({ seed: 23, base: 236, amp: 36, period: 6, color: '#5e5068', shade: '#52465c', jag: 0.06 });
    far.ridge({ seed: 25, base: 256, amp: 18, period: 9, color: '#4a3e4a', shade: '#40363f', jag: 0.08 });
    far.birds(rand, 7, '#2e2636', 120);
    return { far: far.toCanvas(), overlay: mistLayer(186, 50, '#f6d8c4', 0.25) };
  },
};
