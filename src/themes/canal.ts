import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 173;
/** The landmark: the old mill's chimney, standing over the wharf. */
const CHIMNEY: [number, number] = [8, 4];
/** The canal runs east along these rows from a wide basin by the west warehouses. */
const CANAL = [10, 11];
const BASIN = { x0: 2, x1: 6, y0: 8, y1: 13 };
/**
 * The lock: the land (and the canal with it) steps down one level from here east, and the
 * gates hold the upper pound back.
 */
const LOCK_X = 12;
/** A stone bridge over the upper pound, a timber footbridge over the lower one. */
const STONE_BRIDGE = 9;
const FOOTBRIDGE = 16;

/** Warehouses and the mill along the back edges: [from, to, height above the ground behind]. */
const NORTH: [number, number, number][] = [[0, 5, 6], [6, 10, 7], [11, 15, 6], [16, 19, 5]];
const WEST: [number, number, number][] = [[2, 7, 5], [8, 13, 4], [14, 19, 5]];
/** Terraced houses on the south bank, walkable over their roofs: [x0, x1, y]. */
const TERRACES: [number, number, number][] = [[3, 6, 17], [14, 17, 16]];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '8,4': 'mill_chimney',
  // Boats moored in the basin and along the canal; the lock gates.
  '4,9': 'narrowboat', '3,12': 'narrowboat', '14,11': 'narrowboat', '18,10': 'narrowboat',
  '12,10': 'lock_gate', '12,11': 'lock_gate',
  // Bollards along the quays and towpaths, cargo on the wharf.
  '3,7': 'bollard', '6,7': 'bollard', '8,9': 'bollard', '11,9': 'bollard', '14,12': 'bollard', '18,12': 'bollard', '4,14': 'bollard',
  '3,5': 'crate', '4,5': 'barrel', '11,3': 'crate', '12,3': 'barrel',
  // Lamps along the water, trees and a bench or two on the south bank.
  '10,8': 'lamp_post', '15,8': 'lamp_post', '10,13': 'lamp_post', '17,13': 'lamp_post',
  '15,4': 'broadleaf', '18,6': 'broadleaf', '8,16': 'tree', '10,18': 'broadleaf', '9,14': 'bench', '12,17': 'bench', '19,18': 'planter',
};

const ground = (x: number) => (x < LOCK_X ? 2 : 1);

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  const land = ground(x);
  const block = (blocks: typeof NORTH, v: number) => blocks.find(([a, b]) => v >= a && v <= b)!;
  if (y <= 1) return { terrain: 'brick_building', height: land + block(NORTH, x)[2] };
  if (x <= 1) return { terrain: 'brick_building', height: land + block(WEST, y)[2] };
  // The water: the basin and the upper pound stand a level above the lower pound.
  const basin = x >= BASIN.x0 && x <= BASIN.x1 && y >= BASIN.y0 && y <= BASIN.y1;
  if (basin || (x > BASIN.x1 && CANAL.includes(y))) {
    const bridge = x === STONE_BRIDGE ? 'bridge_stone' : x === FOOTBRIDGE ? 'bridge_wood' : undefined;
    return { terrain: 'deep_water', height: land - 1, water: { kind: 'lake', flow: [0, 0] }, feature: bridge, prop };
  }
  // Flagged quays round the basin, gravel towpaths along the canal.
  if (x <= BASIN.x1 && (y === BASIN.y0 - 1 || y === BASIN.y1 + 1)) return { terrain: 'flagstone', height: land, prop };
  if (x > BASIN.x1 && (y === CANAL[0] - 1 || y === CANAL[1] + 1)) return { terrain: 'gravel', height: land, prop };
  const terrace = TERRACES.find(([x0, x1, ty]) => y === ty && x >= x0 && x <= x1);
  if (terrace) return { terrain: 'house_brick', height: land + 3 };
  // A small green on the south bank; cobbles everywhere else.
  if (x >= 7 && x <= 11 && y >= 15) return { terrain: (x + y) % 5 === 0 ? 'meadow' : 'plains', height: land, prop };
  return { terrain: 'cobblestone', height: land, prop };
}

export const canal: Theme = {
  id: 'canal',
  name: 'Canal Quarter',
  category: 'Modern Town',
  map: () => buildMap(SEED, SIZE, place),
  focus: CHIMNEY,
  zoom: 0.85,
  light: {
    background: '#d4d8dc', sky: '#eceef0', bounce: '#4a4440', ambient: 1.4,
    sun: '#fff0dc', sunIntensity: 2.1, sunFrom: [-5, 9, 4], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // A soft, hazy morning over the old mill town.
    far.sky([[0, '#7a96b4'], [140, '#b8c6d2'], [220, '#dcdedc'], [269, '#e4e4e0']]);
    far.sun(1100, 110, 9, '#fff4e0', 2.4);
    far.skyline({ rand, base: 248, minH: 36, maxH: 96, colors: ['#9a8a84', '#a4948a', '#8e8480'], window: '#c4bcb4', lit: 0.2, roofline: '#b0a49c' });
    far.mist(186, 50, '#e4e2dc', 0.45);
    far.rooftops({ rand, base: 262, walls: ['#9a4a34', '#a4553c', '#8a4430'], roofs: ['#4e525a', '#5a5e66'], window: '#3c4c60' });
    far.birds(rand, 6, '#3a4048', 90);
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 16, 18, 110) };
  },
};
