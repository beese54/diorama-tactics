import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 167;
/** The landmark: the playground in the middle of the park. */
const PLAYGROUND: [number, number] = [10, 10];
/** The street bends round the park: along y = 5 from the east edge, then down x = 5 to the front. */
const STREET = 5;
const POND: [number, number] = [16, 16];
/** Houses two tiles deep along the back edges, each with a garden in front behind a hedge. [from, to] */
const NORTH_HOUSES = [[1, 2], [6, 7], [12, 13], [18, 19]];
const WEST_HOUSES = [[7, 8], [13, 14], [18, 19]];
/** Each front door's garden path out to the street. */
const NORTH_PATHS = [2, 7, 13, 18];
const WEST_PATHS = [8, 14, 18];
/** Hedges between neighbours' gardens. */
const NORTH_FENCES = [4, 10, 16];
const WEST_FENCES = [10, 16];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '10,10': 'playground',
  // Gardens: washing out to dry, a tree or two.
  '3,2': 'washing_line', '11,2': 'washing_line', '3,12': 'washing_line', '8,3': 'tree', '17,2': 'tree', '2,6': 'tree',
  // Street lamps along the park's edge.
  '6,10': 'lamp_post', '6,16': 'lamp_post', '11,6': 'lamp_post', '17,6': 'lamp_post',
  // The park: picnic tables, benches by the pond, ducks on it, big trees round the edge.
  '16,9': 'picnic_table', '11,17': 'picnic_table', '12,14': 'bench', '17,12': 'bench', '15,18': 'ducks',
  '18,8': 'broadleaf', '8,8': 'broadleaf', '19,12': 'broadleaf', '8,18': 'tree', '13,8': 'planter',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  const within = (ranges: number[][], v: number) => ranges.some(([a, b]) => v >= a && v <= b);
  // North gardens.
  if (y < STREET) {
    if (y <= 1 && within(NORTH_HOUSES, x)) return { terrain: 'house_brick', height: 4 };
    if (y >= 2 && NORTH_PATHS.includes(x)) return { terrain: 'gravel', height: 1, prop };
    if (y === STREET - 1 || NORTH_FENCES.includes(x)) return { terrain: 'hedge', height: 2 };
    return { terrain: 'lawn', height: 1, prop };
  }
  // West gardens.
  if (x < STREET) {
    if (x <= 1 && within(WEST_HOUSES, y)) return { terrain: 'house_brick', height: 4 };
    if (x >= 2 && WEST_PATHS.includes(y)) return { terrain: 'gravel', height: 1, prop };
    if (x === STREET - 1 || WEST_FENCES.includes(y)) return { terrain: 'hedge', height: 2 };
    return { terrain: 'lawn', height: 1, prop };
  }
  if (y === STREET || x === STREET) return { terrain: 'asphalt', height: 1, prop };
  if (y === STREET + 1 || x === STREET + 1) return { terrain: 'pavement', height: 1, prop };
  // The park.
  // Measured from tile centres to a point between tiles, so the pond comes out round.
  const pond = Math.hypot(x + 0.5 - POND[0], y + 0.5 - POND[1]);
  if (pond < 1) return { terrain: 'deep_water', height: 0, water: { kind: 'lake', flow: [0, 0] } };
  if (pond < 2.6) return { terrain: 'shallow_water', height: 0, water: { kind: 'lake', flow: [0, 0] }, prop };
  if (Math.abs(x - PLAYGROUND[0]) <= 1 && Math.abs(y - PLAYGROUND[1]) <= 1) return { terrain: 'bark', height: 1, prop };
  // A grassy hill in the front corner, for sledging when it snows.
  const hill = Math.hypot(x - 8, y - 18);
  if (hill <= 1) return { terrain: 'lawn', height: 3, prop };
  if (hill <= 2.3) return { terrain: 'lawn', height: 2, prop };
  // Gravel paths in from the gate and down from the street, flowers either side of the gate.
  if ((y === 13 && x <= 13) || (x === 13 && y <= 13)) return { terrain: 'gravel', height: 1, prop };
  if (x === STREET + 2 && (y === 12 || y === 14)) return { terrain: 'flowerbed', height: 1, prop };
  return { terrain: 'lawn', height: 1, prop };
}

export const suburb: Theme = {
  id: 'suburb',
  name: 'Suburban Park',
  category: 'Modern Town',
  map: () => buildMap(SEED, SIZE, place),
  focus: PLAYGROUND,
  zoom: 0.85,
  light: {
    background: '#d4e8f4', sky: '#f0f6ff', bounce: '#4e5a3e', ambient: 1.35,
    sun: '#fff8e4', sunIntensity: 2.5, sunFrom: [-4, 10, 4], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4a8ad0'], [140, '#a4cceb'], [220, '#e2eef6'], [269, '#eaf2f6']]);
    far.sun(600, 50, 9, '#fffbe8', 3);
    far.ridge({ seed: 71, base: 214, amp: 36, period: 3, color: '#9ab894', shade: '#8aa886', jag: 0.04 });
    far.rooftops({ rand, base: 236, walls: ['#b8735a', '#e4dccc', '#a4533c'], roofs: ['#8c4c3c', '#76402f', '#5a6270'], window: '#3c4c60' });
    far.treeline({ rand, base: 252, color: '#5a8a4a', light: '#6a9c56', kind: 'round', size: 10 });
    far.treeline({ rand, base: 266, color: '#4a7a3e', light: '#5a8c4a', kind: 'round', size: 12 });
    far.birds(rand, 6, '#3a4450', 90);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 12, 18, 110) };
  },
};
