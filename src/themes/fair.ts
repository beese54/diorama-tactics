import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 157;
/** The landmark: the maypole in the middle of the village green. */
const MAYPOLE: [number, number] = [10, 10];
const GREEN_RADIUS = 5.2;
/** Thatched cottages along the back edges, as [x0, y0, x1, y1]; their roofs can be stood on. */
const COTTAGES: [number, number, number, number][] = [[1, 1, 2, 1], [6, 1, 7, 1], [1, 6, 1, 7], [14, 1, 15, 1], [1, 13, 1, 14]];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '10,10': 'maypole',
  // Tents around the green, their open flaps facing the maypole.
  '7,6': 'fair_tent', '13,7': 'fair_tent', '6,13': 'fair_tent', '14,13': 'fair_tent',
  // Bunting strung across the way in, stalls and the well.
  '10,5': 'bunting', '5,10': 'bunting', '15,10': 'bunting', '10,15': 'bunting',
  '8,8': 'stall', '12,12': 'stall', '9,7': 'stall', '8,12': 'well',
  // Hay and stores at the field edges; the orchard behind the cottages.
  '4,16': 'haystack', '16,4': 'haystack', '17,17': 'haystack', '3,4': 'barrel', '4,4': 'crate',
  '17,2': 'tree', '18,4': 'tree', '16,2': 'tree', '2,17': 'tree', '4,18': 'tree', '2,15': 'tree',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  const cottage = COTTAGES.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  if (cottage) return { terrain: 'house_thatch', height: 3 };
  // The track: along the back of the green and out to the front corner.
  if ((y === 3 && x >= 2) || (x === 3 && y >= 3) || x === y) return { terrain: 'road', height: 1, prop: x === y && prop !== 'maypole' ? undefined : prop };
  const green = Math.hypot(x - MAYPOLE[0], y - MAYPOLE[1]);
  if (green < GREEN_RADIUS) return { terrain: green < 2 ? 'meadow' : 'plains', height: 1, prop };
  // Fields in strips beyond the green, each its own crop, and a meadow at the edges.
  const field = Math.floor((x + 2 * y) / 5);
  const crop = valueNoise(SEED, field, 0) > 0.4;
  return { terrain: crop ? 'farmland' : 'meadow', height: 1, prop };
}

export const fair: Theme = {
  id: 'fair',
  name: 'Village Fair',
  category: 'Kingdom',
  map: () => buildMap(SEED, SIZE, place),
  focus: MAYPOLE,
  zoom: 0.85,
  light: {
    background: '#d8e8f4', sky: '#f4f6e8', bounce: '#5a5a3a', ambient: 1.35,
    sun: '#fff2d4', sunIntensity: 2.5, sunFrom: [-4, 10, 3], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4c88cc'], [130, '#a8cce8'], [210, '#e6f0f4'], [269, '#eef4f4']]);
    far.sun(800, 40, 9, '#fffbe8', 3);
    far.ridge({ seed: 61, base: 212, amp: 50, period: 4, color: '#a2b89c', shade: '#92a88e', jag: 0.05 });
    far.rooftops({ rand, base: 230, walls: ['#d8ccb0', '#cbbd9f'], roofs: ['#b08a48', '#a4553c'], window: '#4a4a52' });
    far.mist(222, 20, '#eef4f0', 0.35);
    far.treeline({ rand, base: 254, color: '#6a8e54', light: '#78a060', kind: 'round', size: 10 });
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 10, 16, 110) };
  },
};
