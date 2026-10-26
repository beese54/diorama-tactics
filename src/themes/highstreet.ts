import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 179;
/** The landmark: the town clock tower on its raised square where the shopping streets meet. */
const CLOCK: [number, number] = [9, 9];
/** The main road crosses the front of the town, with a zebra crossing; a side street joins it from the north. */
const ROAD = [13, 14];
const ZEBRA_X = 9;
const SIDE_STREET = [15, 16];

/** Shops along the back edges, brick and painted render in turn: [from, to, height]. */
const NORTH: [number, number, number][] = [[0, 3, 7], [4, 6, 6], [7, 10, 8], [11, 14, 6], [15, 16, 7], [17, 19, 6]];
const WEST: [number, number, number][] = [[2, 5, 6], [6, 9, 7], [10, 12, 6], [13, 16, 8], [17, 19, 7]];
const shops = (blocks: typeof NORTH, v: number): Cell => {
  const i = blocks.findIndex(([a, b]) => v >= a && v <= b);
  return { terrain: i % 2 ? 'shop_building' : 'shop_brick', height: blocks[i][2] };
};

/** Hand-placed street furniture, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '9,9': 'clock_tower',
  // Along the shopfronts: a phone box, post boxes, benches round the square, trees in the paving.
  '5,3': 'phone_box', '12,3': 'post_box', '3,10': 'post_box', '7,8': 'bench', '11,10': 'bench',
  '5,6': 'tree', '12,6': 'tree', '5,11': 'tree', '3,5': 'planter',
  // Café tables outside the shops on the corner of the side street.
  '17,4': 'cafe_table', '18,6': 'cafe_table', '17,8': 'cafe_table',
  // The crossing's beacons, the lights at the junction, the bus stop and lamps.
  '8,12': 'belisha', '10,15': 'belisha', '17,12': 'traffic_light', '13,15': 'bus_shelter',
  '4,12': 'lamp_post', '14,11': 'lamp_post', '4,15': 'lamp_post', '18,15': 'lamp_post',
  // South of the road: Saturday market stalls and trees.
  '4,17': 'stall', '6,18': 'stall', '9,17': 'tree', '15,17': 'tree', '18,18': 'bench',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  if (y <= 1) return shops(NORTH, x);
  if (x <= 1) return shops(WEST, y);
  if (ROAD.includes(y)) return { terrain: x === ZEBRA_X ? 'zebra' : 'asphalt', height: 1, prop };
  if (SIDE_STREET.includes(x) && y < ROAD[0]) return { terrain: 'asphalt', height: 1, prop };
  // The square round the clock tower, a step up from the street.
  if (Math.abs(x - CLOCK[0]) <= 1 && Math.abs(y - CLOCK[1]) <= 1) return { terrain: 'flagstone', height: 2, prop };
  return { terrain: 'pavement', height: 1, prop };
}

export const highstreet: Theme = {
  id: 'highstreet',
  name: 'High Street',
  category: 'Modern Town',
  map: () => buildMap(SEED, SIZE, place),
  focus: CLOCK,
  zoom: 0.85,
  light: {
    background: '#d8e4ee', sky: '#f2f4f8', bounce: '#5a5048', ambient: 1.35,
    sun: '#fff4e2', sunIntensity: 2.4, sunFrom: [-5, 10, 3], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4c84c4'], [140, '#a4c4e2'], [220, '#e0eaf2'], [269, '#e8eef4']]);
    far.sun(400, 70, 9, '#fffbe8', 3);
    far.ridge({ seed: 81, base: 222, amp: 40, period: 3, color: '#a4b4a8', shade: '#94a498', jag: 0.05 });
    far.rooftops({ rand, base: 244, walls: ['#d8c8a4', '#b05a40', '#e4dccc', '#a4533c'], roofs: ['#5e626a', '#8c4c3c', '#4e525a'], window: '#3c4c60' });
    far.rooftops({ rand, base: 264, walls: ['#c4b28e', '#9a4a34', '#d8c8a4'], roofs: ['#4e525a', '#76402f'], window: '#3c4c60' });
    far.birds(rand, 8, '#3a4450', 80);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 12, 18, 110) };
  },
};
