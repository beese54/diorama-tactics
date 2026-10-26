import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 239;
/** The landmark: the sky shrine on the largest island, its crystal floating in a ring of stone. */
const SHRINE: [number, number] = [6, 6];
/** Islands floating over a sea of cloud: centre, radius and the height of their tops. */
const ISLES: [number, number, number, number][] = [[6, 6, 4.6, 7], [15, 5, 3.6, 6], [4.5, 15, 3.6, 5], [14.5, 14.5, 4.4, 6]];
/** The cloud tops lie a couple of steps up, so the islands' undersides vanish into them. */
const CLOUDS = 2;
/** Stone spans on arches from island to island: [x0, y0, x1, y1, height], each a straight row of tiles. */
const SPANS: [number, number, number, number, number][] = [[8, 6, 13, 6, 6], [5, 8, 5, 13, 5], [15, 7, 15, 12, 6], [7, 15, 12, 15, 5]];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '6,6': 'sky_shrine',
  '15,4': 'windmill',
  // Wind-bent pines and boulders on the islands, banners on the spans.
  '4,4': 'pine', '8,8': 'pine', '3,7': 'boulder', '17,6': 'pine', '3,14': 'pine', '6,16': 'boulder',
  '13,13': 'pine', '16,16': 'broadleaf', '17,13': 'boulder', '12,16': 'pine',
  '10,6': 'banner', '15,10': 'banner',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  for (const [cx, cy, r, top] of ISLES) {
    // Measured from tile centres with a wobble, so the islands come out as rounded blobs.
    const d = Math.hypot(x + 0.5 - cx - 0.5, y + 0.5 - cy - 0.5) + 0.6 * (valueNoise(SEED, x / 1.8, y / 1.8) - 0.5);
    if (d < r) {
      const knoll = valueNoise(SEED + 1, x / 2.4, y / 2.4) > 0.6 ? 1 : 0;
      return { terrain: 'sky_grass', height: top + (d < r - 1.2 ? knoll : 0), prop };
    }
  }
  const span = SPANS.find(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  if (span) return { terrain: 'sky_span', height: span[4], prop };
  return { terrain: 'cloud_sea', height: CLOUDS };
}

export const skyisles: Theme = {
  id: 'skyisles',
  name: 'Sky Isles',
  category: 'Elemental',
  map: () => buildMap(SEED, SIZE, place),
  focus: SHRINE,
  zoom: 0.85,
  light: {
    background: '#a8c8ec', sky: '#ffffff', bounce: '#c8d8ec', ambient: 1.4,
    sun: '#fff8e8', sunIntensity: 2.5, sunFrom: [-4, 10, 4], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // High above everything: a deep blue sky paling to the cloud tops, other isles adrift.
    far.sky([[0, '#2a64b4'], [120, '#6aa0dc'], [200, '#c4dcf2'], [269, '#e8f0f8']]);
    far.sun(500, 50, 10, '#fffbe8', 3);
    far.isles({ rand, count: 9, minY: 90, maxY: 190, grass: '#7aa860', rock: '#a8a49a', shade: '#8a867e' });
    far.ridge({ seed: 151, base: 218, amp: 26, period: 6, color: '#f4f8fc', shade: '#dce6f2', jag: 0.08 });
    far.ridge({ seed: 153, base: 246, amp: 18, period: 8, color: '#ffffff', shade: '#e8eef6', jag: 0.06 });
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 14, 20, 150) };
  },
};
