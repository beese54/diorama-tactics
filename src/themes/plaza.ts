import { buildMap, type Cell } from '../map/build';
import type { PropId, TerrainId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 63;

/** Building blocks along the two back edges: [from, to, terrain, height], two tiles deep. */
const NORTH: [number, number, TerrainId, number][] = [[0, 4, 'brick_building', 7], [5, 8, 'plaster_building', 6], [9, 13, 'brick_building', 9], [14, 16, 'plaster_building', 5], [17, 19, 'brick_building', 7]];
const WEST: [number, number, TerrainId, number][] = [[2, 6, 'plaster_building', 8], [7, 11, 'brick_building', 6], [12, 15, 'plaster_building', 7], [16, 19, 'brick_building', 5]];

/** Hand-placed street furniture, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '9,9': 'fountain',
  '7,7': 'tree', '11,7': 'tree', '7,11': 'tree', '11,11': 'tree',
  '9,7': 'bench', '9,11': 'bench', '7,9': 'bench', '11,9': 'bench',
  '5,5': 'planter', '13,5': 'planter', '5,13': 'planter', '13,13': 'planter',
  '5,9': 'lamp_post', '13,9': 'lamp_post', '9,5': 'lamp_post', '9,13': 'lamp_post',
  '2,5': 'traffic_light', '5,2': 'traffic_light', '14,17': 'traffic_light', '17,14': 'traffic_light',
  '18,8': 'tree', '8,18': 'tree', '18,12': 'planter', '12,18': 'planter', '2,9': 'lamp_post', '9,2': 'lamp_post',
};

/** Which strip a coordinate falls in, the same across both axes. */
function band(v: number): 'building' | 'pavement' | 'road' | 'park' {
  if (v <= 1) return 'building';
  if (v === 3 || v === 4 || v === 15 || v === 16) return 'road';
  if (v >= 6 && v <= 12) return 'park';
  return 'pavement';
}

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  const block = (blocks: typeof NORTH, v: number) => blocks.find(([a, b]) => v >= a && v <= b)!;
  if (y <= 1) {
    const [, , terrain, height] = block(NORTH, x);
    return { terrain, height };
  }
  if (x <= 1) {
    const [, , terrain, height] = block(WEST, y);
    return { terrain, height };
  }
  const bx = band(x);
  const by = band(y);
  if (bx === 'road' || by === 'road') return { terrain: 'asphalt', height: 1, prop };
  // The park: a raised lawn around a paved square with the fountain.
  if (bx === 'park' && by === 'park') {
    if (x >= 8 && x <= 10 && y >= 8 && y <= 10) return { terrain: 'pavement', height: 2, prop };
    const corner = (x === 6 || x === 12) && (y === 6 || y === 12);
    return { terrain: corner || (x + y) % 6 === 0 ? 'meadow' : 'plains', height: 2, prop };
  }
  return { terrain: 'pavement', height: 1, prop };
}

export const plaza: Theme = {
  id: 'plaza',
  name: 'Fountain Plaza',
  category: 'Modern Town',
  map: () => buildMap(SEED, SIZE, place),
  focus: [9, 9],
  zoom: 0.85,
  light: {
    background: '#d8ecf8', sky: '#eef4ff', bounce: '#5a5048', ambient: 1.35,
    sun: '#fff6e8', sunIntensity: 2.4, sunFrom: [-4, 10, 6], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4f92dc'], [150, '#a9d0f0'], [230, '#dcedf8'], [269, '#e6f2fa']]);
    far.skyline({ rand, base: 252, minH: 50, maxH: 130, colors: ['#93a2b6', '#9eaabb', '#a7b1c0'], window: '#c9d9e8', lit: 0.3, roofline: '#b4bdca' });
    far.skyline({ rand, base: 266, minH: 30, maxH: 85, colors: ['#b97a64', '#c8a482', '#94a184', '#ae8c70'], window: '#e4eef6', lit: 0.45 });
    far.birds(rand, 8, '#3a4450', 60);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 14, 20, 110) };
  },
};
