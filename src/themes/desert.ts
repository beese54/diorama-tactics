import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import { mistLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 127;
const OASIS: [number, number] = [10, 12];
/** The landmark: a sandstone arch on the canyon floor, in front of the big mesa. */
const ARCH: [number, number] = [4, 13];

/** Mesas: centre, radius and height. Their edges wander with noise so they read as eroded rock. */
const MESAS: { at: [number, number]; r: number; height: number }[] = [
  { at: [3, 3.5], r: 4.2, height: 5 },
  { at: [16.5, 3.5], r: 3.2, height: 4 },
  { at: [16.5, 16], r: 1.6, height: 6 },
];
/** Rock stairs up the two big mesas: [x, y, height]. */
const RAMPS: [number, number, number][] = [
  [9, 8, 2], [8, 8, 3], [7, 8, 4],
  [16, 8, 2], [16, 7, 3],
];
/** Palms ring the pool, leaving gaps to walk in from every side. */
const PALMS = new Set(['7,10', '8,15', '12,9', '13,14', '7,13', '13,11']);
const CACTI = new Set(['1,16', '5,18', '11,3', '18,10', '7,17', '14,18', '9,5']);
const ROCKS = new Set(['8,4', '13,6', '18,13']);

function mesaAt(x: number, y: number): number {
  for (const { at, r, height } of MESAS) {
    const edge = r + 1.1 * (valueNoise(SEED ^ height, x / 1.6, y / 1.6) - 0.5);
    if (Math.hypot(x - at[0], y - at[1]) < edge) return height;
  }
  return 0;
}

function place(x: number, y: number): Cell {
  const ramp = RAMPS.find(([rx, ry]) => rx === x && ry === y);
  if (ramp) return { terrain: 'red_rock', height: ramp[2] };
  const mesa = mesaAt(x, y);
  if (mesa) return { terrain: 'red_rock', height: mesa };

  const pool = Math.hypot(x - OASIS[0], y - OASIS[1]);
  if (pool < 1.3) return { terrain: 'deep_water', height: 0, water: { kind: 'lake', flow: [0, 0] } };
  if (pool < 2.4) return { terrain: 'shallow_water', height: 0, water: { kind: 'lake', flow: [0, 0] } };
  if (pool < 3.7) return { terrain: 'oasis_grass', height: 1, prop: PALMS.has(`${x},${y}`) ? 'palm' : undefined };

  // Low dunes roll across the canyon floor.
  const height = valueNoise(SEED, x / 2.8, y / 2.8) > 0.66 ? 2 : 1;
  const key = `${x},${y}`;
  if (x === ARCH[0] && y === ARCH[1]) return { terrain: 'desert', height: 1, prop: 'stone_arch' };
  const prop = CACTI.has(key) ? 'cactus' : ROCKS.has(key) ? 'boulder' : undefined;
  return { terrain: 'desert', height, prop };
}

export const desert: Theme = {
  id: 'desert',
  name: 'Desert Mesa Oasis',
  category: 'Wilds',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    return map;
  },
  focus: ARCH,
  zoom: 0.85,
  light: {
    background: '#f0d8b0', sky: '#fff2dc', bounce: '#8a5a3a', ambient: 1.3,
    sun: '#fff4dc', sunIntensity: 2.6, sunFrom: [-3, 10, 4], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4f8cc8'], [110, '#9cc4e2'], [196, '#ecdcbc'], [269, '#f2e2c4']]);
    far.sun(700, 34, 9, '#fffdf0', 3);
    far.mesas({ rand, base: 214, color: '#d0a088', shade: '#bc8c76', strata: '#c49480', count: 6, minH: 20, maxH: 46 });
    far.mist(196, 30, '#f2e2c4', 0.55);
    far.mesas({ rand, base: 238, color: '#b8704c', shade: '#9e5c3e', strata: '#a86444', count: 4, minH: 26, maxH: 60 });
    far.ridge({ seed: 11, base: 262, amp: 14, period: 9, color: '#dcbc88', shade: '#cfae7a', jag: 0.05 });
    return { far: far.toCanvas(), overlay: mistLayer(150, 60, '#fff6e4', 0.18) };
  },
};
