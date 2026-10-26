import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 191;
/** The landmark: the arcade's big neon sign on its scaffold. */
const SIGN: [number, number] = [10, 7];
/** The whole board is one rooftop, four steps up; taller towers stand along the back. */
const DECK = 4;
const TOWERS = [9, 9, 8, 8, 9, 9, 7, 7, 9, 9, 9, 8, 8, 7, 7, 9, 9, 8, 8, 9];
/** A plant room with a water tank on it, and a higher roof to the north-east: [x0, y0, x1, y1, height]. */
const RAISED: [number, number, number, number, number][] = [[3, 3, 5, 4, DECK + 2], [14, 3, 18, 6, DECK + 1]];
/** The pool, sunk a step into a concrete surround. */
const POOL = { x0: 14, y0: 13, x1: 17, y1: 16 };
/** The turf lounge under string lights. */
const LOUNGE = { x0: 3, y0: 13, x1: 7, y1: 17 };

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '10,7': 'neon_sign',
  // The arcade: cabinets in pairs either side of the way through, claw machines at the ends.
  '7,10': 'arcade_cabinet', '8,10': 'arcade_cabinet', '12,10': 'arcade_cabinet', '13,10': 'arcade_cabinet', '6,10': 'claw_machine', '14,10': 'claw_machine',
  // Plant: water tanks, air conditioners, a vending machine by the stair door.
  '4,3': 'water_tank', '17,4': 'water_tank', '16,9': 'ac_unit', '17,9': 'ac_unit', '3,9': 'ac_unit', '18,18': 'ac_unit', '2,6': 'vending',
  // The lounge and the pool.
  '5,13': 'string_lights', '5,17': 'string_lights', '4,15': 'bench', '6,15': 'bench', '13,12': 'planter', '18,17': 'planter', '11,17': 'vending',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  if (x <= 1 || y <= 1) return { terrain: 'neon_building', height: TOWERS[x <= 1 ? y : x] };
  const raised = RAISED.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  if (raised) return { terrain: raised[4] > DECK + 1 ? 'roof_plant' : 'roof_deck', height: raised[4], prop };
  const inPool = x >= POOL.x0 && x <= POOL.x1 && y >= POOL.y0 && y <= POOL.y1;
  if (inPool) return { terrain: 'shallow_water', height: DECK - 1, water: { kind: 'lake', flow: [0, 0] } };
  if (x >= POOL.x0 - 1 && x <= POOL.x1 + 1 && y >= POOL.y0 - 1 && y <= POOL.y1 + 1) return { terrain: 'pavement', height: DECK, prop };
  if (x >= LOUNGE.x0 && x <= LOUNGE.x1 && y >= LOUNGE.y0 && y <= LOUNGE.y1) return { terrain: 'turf', height: DECK, prop };
  return { terrain: 'roof_deck', height: DECK, prop };
}

export const rooftop: Theme = {
  id: 'rooftop',
  name: 'Rooftop Arcade',
  category: 'Neon City',
  map: () => buildMap(SEED, SIZE, place),
  focus: SIGN,
  zoom: 0.85,
  light: {
    background: '#140e24', sky: '#9a84d8', bounce: '#3a2440', ambient: 1.15,
    sun: '#b4a8ff', sunIntensity: 0.7, sunFrom: [-5, 10, 2], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // Up among the towers: a violet night, the skyline close on every side.
    far.sky([[0, '#0c0a20'], [120, '#1e1640'], [210, '#3a2258'], [269, '#5a2a5e']]);
    far.stars(rand, 70, 110);
    far.sun(300, 60, 8, '#fff0f8', 3.4);
    const neon = ['#ff5fa8', '#4fe3ff', '#ffd84a', '#9a6aff'];
    far.skyline({ rand, base: 236, minH: 110, maxH: 220, colors: ['#1a1434', '#20183c', '#16122c'], window: '#ffb060', lit: 0.16, neon });
    far.skyline({ rand, base: 270, minH: 60, maxH: 150, colors: ['#2a2048', '#302452', '#241c40'], window: '#ffcf80', lit: 0.3, neon });
    return { far: far.toCanvas() };
  },
};
