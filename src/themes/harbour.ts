import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 141;
/** The quay's edge: town on the back side, harbour water in front. */
const QUAY = 13;
/** The landmark: a lighthouse at the end of the stone mole. */
const LIGHTHOUSE: [number, number] = [16, 18];

/** Timber piers reaching out from the quay, and the stone mole to the lighthouse. */
const PIERS = [4, 10];
const MOLE = [16, 17];
/** Cottages with walkable roofs (house_tile), as [x0, y0, x1, y1] blocks. */
const HOUSES: [number, number, number, number][] = [[3, 4, 4, 4], [12, 3, 13, 3], [3, 9, 3, 10], [15, 8, 16, 8], [14, 5, 14, 6]];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  // Boats moored beside the piers and the mole.
  '3,16': 'boat', '5,17': 'boat', '9,15': 'boat', '11,17': 'boat', '15,16': 'boat',
  // Nets drying and cargo along the quay.
  '2,12': 'net_rack', '7,12': 'net_rack', '13,12': 'crate', '14,12': 'barrel', '12,11': 'crate',
  // The market square around the well.
  '9,7': 'well', '7,6': 'stall', '11,6': 'stall', '7,9': 'stall', '11,9': 'stall',
  // Stores by the warehouses.
  '7,2': 'crate', '8,2': 'barrel', '2,7': 'barrel', '17,2': 'crate',
  '18,5': 'banner', '6,8': 'banner',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  if (x === LIGHTHOUSE[0] && y === LIGHTHOUSE[1]) return { terrain: 'flagstone', height: 2, prop: 'lighthouse' };
  // Out in the harbour: the mole and the piers over shallow water, deep water beyond.
  if (y > QUAY) {
    if (MOLE.includes(x)) return { terrain: 'flagstone', height: 2 };
    if (PIERS.includes(x) && y < SIZE - 1) return { terrain: 'boardwalk', height: 1 };
    const deep = y >= 16 && !PIERS.some((p) => Math.abs(p - x) <= 1);
    return { terrain: deep ? 'deep_water' : 'shallow_water', height: 0, water: { kind: 'sea', flow: [0, 0] }, prop };
  }
  // Warehouses close the two back edges.
  if (x === 0 || y === 0) return { terrain: (x + y) % 7 < 4 ? 'brick_building' : 'plaster_building', height: 5 + ((x + y) % 3 === 0 ? 1 : 0) };
  const house = HOUSES.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  if (house) return { terrain: 'house_tile', height: 4 };
  // The quay itself is flagged; the town's streets and square are cobbled.
  if (y >= QUAY - 1) return { terrain: 'flagstone', height: 2, prop };
  if (x >= 7 && x <= 11 && y >= 6 && y <= 9) return { terrain: 'flagstone', height: 2, prop };
  return { terrain: 'cobblestone', height: 2, prop };
}

export const harbour: Theme = {
  id: 'harbour',
  name: 'Harbour Town',
  category: 'Kingdom',
  map: () => buildMap(SEED, SIZE, place),
  focus: LIGHTHOUSE,
  zoom: 0.85,
  light: {
    background: '#cfe2f0', sky: '#e8f2ff', bounce: '#4a5a66', ambient: 1.35,
    sun: '#fff4e0', sunIntensity: 2.4, sunFrom: [-4, 9, 5], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#3f7cc0'], [120, '#94c0e6'], [178, '#d6eaf6'], [190, '#e2f0f8']]);
    far.ridge({ seed: 31, base: 186, amp: 46, period: 3, color: '#8ea4a0', shade: '#7c928e', jag: 0.1 });
    // The open sea out to the horizon, darkening towards the viewer.
    far.ridge({ seed: 33, base: 200, amp: 1, period: 2, color: '#6a9cbc', shade: '#6a9cbc', jag: 0 });
    far.mist(196, 10, '#e8f4fa', 0.6);
    far.ridge({ seed: 35, base: 236, amp: 1, period: 2, color: '#4f86aa', shade: '#4f86aa', jag: 0 });
    far.birds(rand, 9, '#3a4450', 120);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 10, 16, 110) };
  },
};
