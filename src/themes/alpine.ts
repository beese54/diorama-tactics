import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 41;
/** The switchback trail from the valley floor (front) to the summit (back corner). */
const TRAIL: [number, number][] = [[17, 19], [15, 15], [16, 11], [12, 10], [10, 6], [6, 6], [3, 3]];
const TARN: [number, number] = [12.5, 14.5];

/** Distance from a point to the trail's polyline. */
function trailDistance(x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < TRAIL.length - 1; i++) {
    const [ax, ay] = TRAIL[i];
    const [bx, by] = TRAIL[i + 1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
  }
  return best;
}

/** The tarn sits a step below the lowest terrace around it, so it always lies in a basin. */
const TARN_LEVEL = (() => {
  let low = Infinity;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (Math.hypot(x - 12.5, y - 14.5) < 3.5) low = Math.min(low, terrace(x, y));
  return low - 1;
})();

/** Terraces climbing from the valley at the front corner to a snowy summit at the back. */
function terrace(x: number, y: number): number {
  const rise = (2 * SIZE - 2 - x - y) / (2 * SIZE - 2); // 0 at the front corner, 1 at the back
  const wobble = valueNoise(SEED, x / 3.2, y / 3.2) - 0.5;
  return Math.max(1, Math.min(7, 1 + Math.floor(rise * 6.6 + wobble * 1.4)));
}

function place(x: number, y: number, rand: () => number): Cell {
  if (x <= 3 && y <= 3) return { terrain: 'snowfield', height: 7, prop: x === 2 && y === 2 ? 'cairn' : undefined };
  const tarn = Math.hypot(x - TARN[0], y - TARN[1]);
  if (tarn < 1.2) return { terrain: 'deep_water', height: TARN_LEVEL };
  if (tarn < 2.2) return { terrain: 'shallow_water', height: TARN_LEVEL };

  const height = terrace(x, y);
  const rocky = valueNoise(SEED ^ 0x77, x / 2.4, y / 2.4);
  const onTrail = trailDistance(x, y) < 0.75;
  let terrain: Cell['terrain'] =
    height >= 6 ? 'snowfield'
    : height === 5 ? (rocky > 0.55 ? 'scree' : 'snowfield')
    : height >= 3 ? (rocky > 0.68 ? 'mountain' : 'hills')
    : tarn < 3.6 ? 'meadow' : 'plains';
  if (onTrail) terrain = 'road';
  if (onTrail || terrain === 'meadow') return { terrain, height };

  // Pines grow in stands on the middle slopes; boulders litter the rock.
  const stand = valueNoise(SEED ^ 0x3b, x / 2.2, y / 2.2);
  const roll = rand();
  let prop: Cell['prop'];
  if (height >= 2 && height <= 5 && stand > 0.5 && roll < 0.55) prop = height >= 5 ? 'pine_snowy' : 'pine';
  else if ((terrain === 'mountain' || terrain === 'scree') && roll < 0.2) prop = 'boulder';
  else if (roll < 0.03) prop = 'boulder';
  return { terrain, height, prop };
}

export const alpine: Theme = {
  id: 'alpine',
  name: 'Alpine Pass',
  category: 'Wilds',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    return map;
  },
  focus: [2, 2],
  zoom: 0.85,
  light: {
    background: '#cfe2f0', sky: '#e2ecff', bounce: '#4a5566', ambient: 1.35,
    sun: '#fff6e6', sunIntensity: 2.4, sunFrom: [-4, 10, 6], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#3f78bc'], [130, '#94c0e6'], [200, '#d4e8f4'], [269, '#e6f1f7']]);
    far.sun(380, 40, 8, '#fffbe8');
    far.ridge({ seed: 7, base: 200, amp: 140, period: 5, color: '#8e98aa', shade: '#737d90', snow: { color: '#f2f6f9', above: 128 }, jag: 0.18 });
    far.mist(150, 50, '#dcebf4', 0.5);
    far.ridge({ seed: 9, base: 222, amp: 70, period: 8, color: '#6f8796', shade: '#5c7383', snow: { color: '#e8eff4', above: 170 }, jag: 0.15 });
    far.treeline({ rand, base: 248, color: '#3c5a4a', light: '#4a6c58', kind: 'pine', size: 9 });
    far.birds(rand, 8, '#2a3440', 50);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 12, 20, 120) };
  },
};
