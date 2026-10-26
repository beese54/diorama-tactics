import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { mistLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 211;
/** The landmark: a colossal stone face on the sanctuary, the highest ground above the flood. */
const IDOL: [number, number] = [10, 10];
/** The sanctuary platform round it, stepping up in rings. */
const SANCTUARY = 2;
/** A causeway out of the water to the front edge, broken in one place. */
const CAUSEWAY_X = 10;
const BREACH_Y = 16;
/** Smaller platforms standing out of the water: [x0, y0, x1, y1, height]. */
const PLATFORMS: [number, number, number, number, number][] = [[3, 4, 5, 6, 2], [14, 3, 16, 5, 1], [3, 14, 6, 16, 1], [15, 13, 17, 16, 2]];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '10,10': 'stone_idol',
  // Columns at the sanctuary's corners and on the platforms; fallen ones on the low platforms.
  '8,8': 'column', '12,8': 'column', '8,12': 'column', '3,4': 'column', '5,6': 'column', '15,13': 'column', '17,16': 'column',
  '15,4': 'pillar', '4,15': 'pillar', '6,14': 'boulder',
  // Lilies on the shallows, trees rooted in the ruined facade.
  '7,4': 'lilies', '12,5': 'lilies', '6,10': 'lilies', '13,15': 'lilies', '8,17': 'lilies', '17,9': 'lilies', '18,18': 'lilies',
  '2,1': 'jungle_tree', '1,12': 'jungle_tree', '13,1': 'jungle_tree',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  // The temple's ruined facade along the back edges, crumbling lower in places.
  if (x <= 1 || y <= 1) {
    const crumble = valueNoise(SEED, x / 2, y / 2);
    return { terrain: crumble > 0.6 ? 'ruined_wall' : 'temple_stone', height: crumble > 0.6 ? 4 : 6, prop };
  }
  const ring = Math.max(Math.abs(x - IDOL[0]), Math.abs(y - IDOL[1]));
  if (ring <= SANCTUARY) return { terrain: 'temple_stone', height: 3 - ring, prop };
  if (x === CAUSEWAY_X && y > IDOL[1] + SANCTUARY && y !== BREACH_Y) return { terrain: 'temple_stone', height: 1, prop };
  const platform = PLATFORMS.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  if (platform) return { terrain: (x + y) % 3 === 0 ? 'ruined_wall' : 'temple_stone', height: platform[4], prop };
  // The flood: wadeable shallows over the old courtyards, deep where the floor has fallen in.
  const deep = valueNoise(SEED + 3, x / 2.8, y / 2.8) > 0.68;
  return { terrain: deep ? 'deep_water' : 'shallow_water', height: 0, water: { kind: 'lake', flow: [0, 0] }, prop: deep ? undefined : prop };
}

export const sunken: Theme = {
  id: 'sunken',
  name: 'Sunken Temple',
  category: 'Ancient Ruins',
  map: () => buildMap(SEED, SIZE, place),
  focus: IDOL,
  zoom: 0.85,
  light: {
    background: '#c4d8d0', sky: '#e4f0e8', bounce: '#2a4a40', ambient: 1.25,
    sun: '#fff0d0', sunIntensity: 1.9, sunFrom: [-6, 8, 4], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // A misty morning over drowned jungle.
    far.sky([[0, '#6a9aa4'], [140, '#b4d0cc'], [220, '#dce8e0'], [269, '#e4ece4']]);
    far.sun(700, 90, 10, '#fffae8', 2.6);
    far.temples({ base: 212, color: '#9ab4aa', at: [500, 1400] });
    far.canopy({ rand, base: 222, color: '#7ea08e', light: '#8eb09c', size: 20 });
    far.mist(190, 44, '#e4eee6', 0.6);
    far.canopy({ rand, base: 246, color: '#4a7258', light: '#5a8466', size: 26 });
    return { far: far.toCanvas(), overlay: mistLayer(160, 50, '#eef6f0', 0.4) };
  },
};
