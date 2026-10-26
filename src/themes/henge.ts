import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { mistLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 227;
/** The circle's centre; the avenue leaves it towards the front corner. */
const CENTRE: [number, number] = [10, 10];
/** The landmark: the great trilithon at the head of the horseshoe, facing down the avenue. */
const GREAT: [number, number] = [8, 8];
/** The horseshoe of trilithons inside the ring, open towards the avenue. */
const HORSESHOE = ['7,10', '10,7', '8,12', '12,8'];
/** The ring of standing stones, and the earthwork round it: a ditch inside a bank. */
const RING = 4.6;
const DITCH: [number, number] = [6.2, 7.2];
const BANK: [number, number] = [7.2, 8.4];
/** Burial mounds out on the downs: [x, y, radius]. */
const BARROWS: [number, number, number][] = [[3, 16, 2.2], [16, 3, 1.8], [2, 4, 1.6]];

/** The ring's stones: one every 30°, on whichever tile is nearest. */
const STONES = new Set(Array.from({ length: 12 }, (_, k) => {
  const a = (k * Math.PI) / 6;
  return `${Math.round(CENTRE[0] + RING * Math.cos(a))},${Math.round(CENTRE[1] + RING * Math.sin(a))}`;
}));

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  // The outlying heel stone on the avenue, sheep grazing, trees along the back.
  '16,16': 'standing_stone', '5,12': 'sheep', '13,17': 'sheep', '17,10': 'sheep', '4,9': 'sheep',
  '1,1': 'broadleaf', '0,7': 'broadleaf', '9,0': 'broadleaf', '1,12': 'tree', '13,1': 'tree',
};

const avenue = (x: number, y: number) => Math.abs(x - y) <= 1 && x + y > CENTRE[0] + CENTRE[1];

function prop(x: number, y: number): PropId | undefined {
  const key = `${x},${y}`;
  if (x === GREAT[0] && y === GREAT[1]) return 'great_trilithon';
  if (HORSESHOE.includes(key)) return 'trilithon';
  if (STONES.has(key)) return 'standing_stone';
  return PROPS[key];
}

function place(x: number, y: number): Cell {
  const p = prop(x, y);
  const r = Math.hypot(x - CENTRE[0], y - CENTRE[1]);
  // The earthwork, broken where the avenue runs out through it.
  if (!avenue(x, y)) {
    if (r >= BANK[0] && r < BANK[1]) return { terrain: 'meadow', height: 3, prop: p };
    if (r >= DITCH[0] && r < DITCH[1]) return { terrain: 'plains', height: 1, prop: p };
  }
  for (const [bx, by, br] of BARROWS) {
    const d = Math.hypot(x - bx, y - by);
    if (d < br) return { terrain: 'meadow', height: d < br / 2 ? 4 : 3, prop: p };
  }
  // Chalk downland, rolling gently; worn chalk where feet have trodden inside the ring.
  const roll = valueNoise(SEED, x / 4, y / 4) > 0.64 ? 1 : 0;
  const worn = r < RING - 1 && valueNoise(SEED + 2, x / 1.6, y / 1.6) > 0.6;
  return { terrain: worn ? 'road' : r > BANK[1] && roll ? 'meadow' : 'plains', height: 2 + (r > BANK[1] ? roll : 0), prop: p };
}

export const henge: Theme = {
  id: 'henge',
  name: 'Stone Circle',
  category: 'Ancient Ruins',
  map: () => buildMap(SEED, SIZE, place),
  focus: GREAT,
  zoom: 0.85,
  light: {
    background: '#e8dcd4', sky: '#ffe8dc', bounce: '#4a4a3a', ambient: 1.25,
    sun: '#ffd8b8', sunIntensity: 2.2, sunFrom: [7, 5, 7], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // Dawn over the downs, mist lying in the hollows.
    far.sky([[0, '#5a7aa8'], [120, '#b4b4cc'], [200, '#f0c8b4'], [269, '#f4d8c4']]);
    far.sun(1640, 196, 12, '#fff0d0', 3);
    far.ridge({ seed: 121, base: 222, amp: 22, period: 3, color: '#9aa490', shade: '#8a9482', jag: 0.03 });
    far.mist(196, 40, '#f4e4dc', 0.55);
    far.ridge({ seed: 123, base: 246, amp: 16, period: 4, color: '#7e8e68', shade: '#72825e', jag: 0.03 });
    far.treeline({ rand, base: 262, color: '#5a6e48', light: '#687c52', kind: 'round', size: 9 });
    return { far: far.toCanvas(), overlay: mistLayer(150, 60, '#f8eee8', 0.4) };
  },
};
