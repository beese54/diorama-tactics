import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 74;
/** Shop-house heights along the two back edges, varying every few tiles. */
const ROOFLINE = [7, 7, 6, 6, 6, 8, 8, 8, 5, 5, 7, 7, 7, 6, 6, 8, 8, 5, 5, 6];

/** Hand-placed decor, keyed "x,y": stalls face the street, lanterns light the canal side. */
const PROPS: Record<string, PropId> = {
  '10,10': 'lantern_gate',
  '4,3': 'stall', '7,3': 'stall', '13,3': 'stall', '16,3': 'stall',
  '3,6': 'stall', '3,13': 'stall',
  '6,6': 'lantern_post', '14,6': 'lantern_post', '6,13': 'lantern_post', '14,13': 'lantern_post',
  '3,15': 'lantern_post', '10,15': 'lantern_post', '17,15': 'lantern_post',
  '2,9': 'vending', '9,2': 'vending', '2,10': 'crate', '11,2': 'barrel', '12,2': 'crate',
  '17,8': 'crate', '18,8': 'barrel', '8,18': 'crate', '15,19': 'lantern_post', '4,19': 'lantern_post',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  if (x <= 1 || y <= 1) return { terrain: 'neon_building', height: ROOFLINE[x <= 1 ? y : x] };
  // A canal running along the front of the board, crossed by two plank bridges.
  if (y === 16 || y === 17) {
    const bridge = x === 6 || x === 7 || x === 13 || x === 14;
    return { terrain: y === 16 ? 'shallow_water' : 'deep_water', height: 0, water: { kind: 'river', flow: [1, 0] }, feature: bridge ? 'bridge_wood' : undefined };
  }
  // A raised wooden stage around the lantern gate: high ground in the middle of the market.
  if (x >= 8 && x <= 12 && y >= 8 && y <= 12) return { terrain: 'boardwalk', height: 2, prop };
  return { terrain: 'wet_street', height: 1, prop };
}

export const market: Theme = {
  id: 'market',
  name: 'Night Market Alley',
  category: 'Neon City',
  map: () => buildMap(SEED, SIZE, place),
  focus: [10, 10],
  zoom: 0.85,
  light: {
    background: '#120e22', sky: '#8a8ad0', bounce: '#2a2030', ambient: 1.1,
    sun: '#a8b8ff', sunIntensity: 0.7, sunFrom: [4, 10, -3], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#0b0a1c'], [140, '#211638'], [230, '#3a2348'], [269, '#4a2a50']]);
    far.stars(rand, 160, 150);
    far.sun(560, 44, 7, '#ece6ff', 3.2);
    const neon = ['#ff5fa8', '#4fe3ff', '#ffd84a'];
    far.skyline({ rand, base: 248, minH: 70, maxH: 170, colors: ['#1c1730', '#211b36', '#19182c'], window: '#ffb060', lit: 0.16, neon });
    far.skyline({ rand, base: 268, minH: 40, maxH: 110, colors: ['#2a2140', '#30264a', '#261e3a'], window: '#ffcf80', lit: 0.3, neon });
    return { far: far.toCanvas() };
  },
};
