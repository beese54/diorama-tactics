import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 52;

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  // The keep: the throne between banners, braziers at the corners of its platform.
  '3,3': 'throne', '2,1': 'banner', '1,2': 'banner', '5,1': 'brazier', '1,5': 'brazier', '5,5': 'brazier',
  // Banners on the battlements.
  '5,0': 'banner', '15,0': 'banner', '0,15': 'banner', '0,8': 'banner',
  // Stores stacked against the walls.
  '9,1': 'crate', '10,1': 'crate', '9,2': 'barrel', '13,1': 'barrel',
  '1,9': 'crate', '1,10': 'barrel', '2,10': 'crate', '1,13': 'crate',
  // Braziers lining the processional way.
  '11,13': 'brazier', '13,11': 'brazier', '15,17': 'brazier', '17,15': 'brazier',
  // The gardens.
  '17,3': 'haystack', '14,5': 'tree', '16,5': 'tree', '18,5': 'haystack',
  '3,15': 'tree', '5,16': 'tree', '4,13': 'haystack',
  // Training ground clutter in the open court.
  '12,7': 'crate', '7,12': 'barrel',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  // Curtain walls on the two back edges, with towers at the corners and the middle.
  if (x === 0 || y === 0) {
    const tower = (x === 0 && y % 10 === 0) || (y === 0 && x % 10 === 0) || x + y === SIZE - 1;
    return { terrain: 'castle_wall', height: tower ? 8 : 6, prop };
  }
  // The keep platform, with steps down to the court on its two open sides.
  if (x <= 5 && y <= 5) return { terrain: 'flagstone', height: 4, prop };
  if (x <= 6 && y <= 6) return { terrain: 'flagstone', height: 3, prop };
  if (x <= 7 && y <= 7) return { terrain: 'flagstone', height: 2, prop };
  // Gardens tucked against the walls.
  if (x >= 13 && x <= 18 && y >= 2 && y <= 6) return { terrain: (x + y) % 5 === 0 ? 'meadow' : 'plains', height: 1, prop };
  if (x >= 2 && x <= 6 && y >= 12 && y <= 17) return { terrain: (x * 3 + y) % 7 === 0 ? 'meadow' : 'plains', height: 1, prop };
  // A flagstone processional way from the keep to the open front corner.
  if (x >= 8 && y >= 8 && Math.abs(x - y) <= 1) return { terrain: 'flagstone', height: 1, prop };
  return { terrain: 'cobblestone', height: 1, prop };
}

export const courtyard: Theme = {
  id: 'courtyard',
  name: 'Castle Courtyard',
  category: 'Kingdom',
  map: () => buildMap(SEED, SIZE, place),
  focus: [3, 3],
  zoom: 0.85,
  light: {
    background: '#e8d8c0', sky: '#ffeedd', bounce: '#4a4038', ambient: 1.25,
    sun: '#ffe4bc', sunIntensity: 2.3, sunFrom: [-6, 8, 3], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#5f8fc4'], [140, '#b9d0e6'], [210, '#ecdcc4'], [269, '#f2e2c8']]);
    far.sun(1320, 70, 9, '#fff3d6');
    far.ridge({ seed: 21, base: 196, amp: 80, period: 4, color: '#a3a9b8', shade: '#9097a8', snow: { color: '#eef1f5', above: 136 } });
    far.castle({ rand, base: 232, color: '#858ca0', shade: '#777e92', flag: '#b8443a', at: [140, 520, 980, 1420, 1760] });
    far.treeline({ rand, base: 250, color: '#5d7356', light: '#6b8262', kind: 'round', size: 8 });
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 12, 25, 120, '#fff8ee', '#eadfce') };
  },
};
