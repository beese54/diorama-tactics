import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 151;
/** The river runs down the board in these columns, deepest in the middle one. */
const RIVER = [9, 10, 11];
/** The road crosses here: over the stone bridge and through the gatehouse on the west bank. */
const ROAD_Y = 9;
const GATEHOUSE: [number, number] = [8, ROAD_Y];
/** Ramparts follow the west bank, the river serving as their moat. */
const RAMPART_X = 8;

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  // In the ward behind the walls: stores, braziers and banners.
  '3,3': 'crate', '4,3': 'barrel', '3,4': 'crate', '2,12': 'barrel', '2,13': 'crate',
  '5,5': 'brazier', '4,14': 'brazier', '4,9': 'banner', '5,16': 'haystack', '3,17': 'crate',
  // On the east bank: woods, a lone oak by the road, rocks along the water.
  '15,3': 'broadleaf', '17,4': 'broadleaf', '16,6': 'tree', '18,2': 'tree',
  '15,14': 'broadleaf', '17,16': 'tree', '16,17': 'broadleaf', '18,13': 'tree',
  '14,11': 'broadleaf', '13,5': 'boulder', '13,16': 'boulder',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  if (x === GATEHOUSE[0] && y === GATEHOUSE[1]) return { terrain: 'cobblestone', height: 1, prop: 'gatehouse' };
  if (RIVER.includes(x)) {
    const deep = x === RIVER[1];
    return {
      terrain: deep ? 'deep_water' : 'shallow_water', height: 0,
      water: { kind: 'river', flow: [0, 1] },
      feature: y === ROAD_Y ? 'bridge_stone' : undefined,
    };
  }
  // The west bank: ramparts along the river, curtain walls on the back edges, a cobbled ward.
  if (x < RIVER[0]) {
    if (x === 0 || y === 0) return { terrain: 'castle_wall', height: (x === 0 && y % 6 === 0) || (y === 0 && x % 6 === 0) ? 6 : 5 };
    if (x === RAMPART_X) return { terrain: 'rampart', height: y % 5 === 2 ? 4 : 3, prop: y === 4 || y === 15 ? 'banner' : undefined };
    if (y === ROAD_Y) return { terrain: 'flagstone', height: 1, prop };
    return { terrain: 'cobblestone', height: 1, prop };
  }
  // The east bank: the road in from the east edge, meadow and woods either side.
  if (y === ROAD_Y) return { terrain: 'road', height: 1, prop };
  const rough = valueNoise(SEED, x / 2.5, y / 2.5) > 0.6;
  const woods = prop === 'broadleaf' || prop === 'tree';
  return { terrain: woods ? 'light_woods' : rough ? 'meadow' : 'plains', height: rough && x > 13 ? 2 : 1, prop };
}

export const bridge: Theme = {
  id: 'bridge',
  name: 'Bridge Gatehouse',
  category: 'Kingdom',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    return map;
  },
  focus: GATEHOUSE,
  zoom: 0.85,
  light: {
    background: '#d8e2ea', sky: '#f2eedc', bounce: '#4a4a3a', ambient: 1.3,
    sun: '#ffeccc', sunIntensity: 2.3, sunFrom: [-6, 8, 2], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4c80bc'], [120, '#a0c2e0'], [200, '#e8e4d4'], [269, '#eee8d8']]);
    far.sun(1300, 110, 9, '#fff6dc', 3);
    far.ridge({ seed: 51, base: 206, amp: 70, period: 4, color: '#98a2b0', shade: '#88929e', jag: 0.1 });
    far.castle({ rand, base: 214, color: '#8e96a2', shade: '#7e8692', flag: '#a83a2c', at: [420, 1500] });
    far.mist(198, 30, '#ece8dc', 0.45);
    far.treeline({ rand, base: 240, color: '#6e8a5c', light: '#7c9a68', kind: 'round', size: 9 });
    far.treeline({ rand, base: 258, color: '#4e6e44', light: '#5c7e50', kind: 'round', size: 11 });
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 9, 16, 110) };
  },
};
