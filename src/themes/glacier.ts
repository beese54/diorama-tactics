import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { scenery, speckLayer } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 233;
/** The landmark: a rune-carved monolith the glacier has half swallowed. */
const MONOLITH: [number, number] = [14, 8];
/** The rift: a crevasse winding down the board, its walls sheer ice to the dark below. */
const riftCentre = (y: number) => 9 + 1.6 * Math.sin(y * 0.45 + 0.6);
/** Snow bridges across the rift. */
const BRIDGES = [6, 14];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '14,8': 'frost_monolith',
  // Seracs, the glacier's broken towers, for cover; boulders the ice has carried down.
  '4,5': 'serac', '6,12': 'serac', '3,16': 'serac', '15,13': 'serac', '17,4': 'serac', '13,17': 'serac',
  '5,8': 'snow_rock', '16,16': 'snow_rock', '18,10': 'snow_rock', '7,18': 'snow_rock',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  // Peaks close the back.
  if (x <= 1 || y <= 1) return { terrain: 'peak_snow', height: 9 };
  // The glacier's surface, thickest towards the mountains.
  const height = Math.min(7, 4 + Math.floor(((38 - x - y) / 38) * 2.4 + valueNoise(SEED, x / 3, y / 3) * 1.4));
  const inRift = Math.abs(x - riftCentre(y)) < 1.6;
  if (inRift && !BRIDGES.includes(y)) return { terrain: 'crevasse', height: 0 };
  // Old snow lies over the ice in drifts.
  const drift = valueNoise(SEED + 4, x / 2.6, y / 2.6) > 0.6;
  return { terrain: drift ? 'snowfield' : 'glacier', height: inRift ? height - 1 : height, prop };
}

export const glacier: Theme = {
  id: 'glacier',
  name: 'Glacier Rift',
  category: 'Elemental',
  map: () => buildMap(SEED, SIZE, place),
  focus: MONOLITH,
  zoom: 0.85,
  light: {
    background: '#0c1426', sky: '#a8c8f0', bounce: '#24344a', ambient: 1.3,
    sun: '#c8dcff', sunIntensity: 1.2, sunFrom: [-4, 9, 4], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // A polar night: the aurora over a range of ice.
    far.sky([[0, '#060c1e'], [120, '#0e1a34'], [210, '#1e2e4a'], [269, '#2a3a56']]);
    far.stars(rand, 150, 170);
    far.aurora({ seed: 141, y: 120, height: 70, colors: ['#4af0a0', '#4ac8f0'], alpha: 0.55 });
    far.sun(1500, 40, 7, '#eef4ff', 3);
    far.ridge({ seed: 143, base: 214, amp: 70, period: 5, color: '#4a5e7a', shade: '#3a4c66', snow: { color: '#c8d8ec', above: 176 }, jag: 0.22 });
    far.ridge({ seed: 145, base: 248, amp: 30, period: 7, color: '#8aa4c0', shade: '#7690ac', jag: 0.06 });
    // Spindrift: loose snow blowing across the glacier.
    return { far: far.toCanvas(), overlay: speckLayer(SEED + 1, 5, ['#ffffff', '#dcecff'], [10, 6]) };
  },
};
