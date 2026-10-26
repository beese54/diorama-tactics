import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 197;
/** The landmark: the shrine hall at the top of the steps, above the city. */
const SHRINE: [number, number] = [10, 3];
/** The stone steps climb the hill up these columns, a step every two tiles. */
const STEPS = [9, 10, 11];
/** The city street along the front edge, where the steps begin. */
const STREET = [18, 19];
/** The shrine's gravel precinct at the top. */
const PRECINCT_TO = 5;
const TOP = 8;

/** Height of the steps at row y: two at the street end, rising a step every two tiles. */
const stepHeight = (y: number) => Math.min(TOP - 1, 2 + Math.floor((17 - y) / 2));

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '10,3': 'shrine',
  // A run of torii over the steps, stone lanterns either side.
  '10,16': 'torii', '10,14': 'torii', '10,12': 'torii', '10,10': 'torii', '10,8': 'torii',
  '8,15': 'stone_lantern', '12,15': 'stone_lantern', '8,11': 'stone_lantern', '12,11': 'stone_lantern', '8,7': 'stone_lantern', '12,7': 'stone_lantern',
  '7,4': 'stone_lantern', '13,4': 'stone_lantern',
  // Cherry trees and pines on the hillside.
  '5,12': 'sakura', '15,9': 'sakura', '4,6': 'sakura', '16,14': 'sakura', '14,3': 'sakura', '6,3': 'pine', '17,6': 'pine', '3,15': 'pine',
  // The street below: a vending machine, lanterns, a noodle stall.
  '4,18': 'vending', '7,18': 'lantern_post', '14,18': 'lantern_post', '17,18': 'stall',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  // Wooded hilltop behind the shrine, along the back edges.
  if (x <= 1 || y <= 1) return { terrain: 'forest', height: TOP + 1 };
  if (STREET.includes(y)) return { terrain: 'wet_street', height: 1, prop };
  if (y <= PRECINCT_TO) return { terrain: 'gravel', height: TOP, prop };
  if (STEPS.includes(x)) return { terrain: 'temple_stone', height: stepHeight(y), prop };
  // The hillside either side rises with the steps, a little higher or lower here and there.
  const lump = valueNoise(SEED, x / 3, y / 3) > 0.62 ? 1 : 0;
  return { terrain: 'moss', height: Math.min(TOP, stepHeight(y) + lump), prop };
}

export const shrine: Theme = {
  id: 'shrine',
  name: 'Shrine Steps',
  category: 'Neon City',
  map: () => buildMap(SEED, SIZE, place),
  focus: SHRINE,
  // A little further out than the others, so the shrine on the hilltop clears the top of the screen.
  zoom: 0.78,
  light: {
    background: '#100e22', sky: '#8a90d8', bounce: '#2a2a30', ambient: 1.15,
    sun: '#b0b8ff', sunIntensity: 0.75, sunFrom: [-4, 10, 3], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // A clear night above the city: a full moon, the towers' lights below and far off.
    far.sky([[0, '#0a0c22'], [130, '#1a1c42'], [210, '#34285a'], [269, '#4a2c5a']]);
    far.stars(rand, 160, 160);
    far.sun(1000, 60, 11, '#fbf6ff', 3.4);
    const neon = ['#ff5fa8', '#4fe3ff', '#ffd84a'];
    far.ridge({ seed: 97, base: 230, amp: 50, period: 3, color: '#1c2034', shade: '#181c2e', jag: 0.12 });
    far.skyline({ rand, base: 262, minH: 40, maxH: 120, colors: ['#1c1830', '#221c38', '#18162a'], window: '#ffc070', lit: 0.3, neon });
    return { far: far.toCanvas() };
  },
};
