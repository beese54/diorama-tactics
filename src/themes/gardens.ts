import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 149;
/** The landmark: a white gazebo on the raised lawn below the palace. */
const GAZEBO: [number, number] = [4, 4];
const FOUNTAIN: [number, number] = [11, 11];

/** The hedge maze in the front-left quarter, rows from y = 11; 'H' is hedge. Its centre holds a statue. */
const MAZE_AT: [number, number] = [2, 11];
const MAZE = [
  'HHH.HHH',
  'H.....H',
  'H.HHH.H',
  '..H.H..',
  'H.H.H.H',
  'H.....H',
  'HHH.HHH',
];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '4,4': 'gazebo',
  // Banners on the palace front.
  '6,0': 'banner', '12,0': 'banner', '0,6': 'banner', '0,12': 'banner',
  // Topiary flanking the walks into the fountain circle, statues at the far ends.
  '9,10': 'topiary', '9,12': 'topiary', '13,10': 'topiary', '13,12': 'topiary',
  '10,9': 'topiary', '12,9': 'topiary', '10,13': 'topiary', '12,13': 'topiary',
  '11,17': 'statue', '17,11': 'statue', '5,14': 'statue',
  // Benches facing the fountain, and on the terrace edge.
  '14,14': 'bench', '8,8': 'bench', '2,8': 'bench',
  // Topiary rows on the front-right lawn.
  '15,15': 'topiary', '17,15': 'topiary', '15,17': 'topiary', '17,17': 'topiary',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  // The palace closes the two back edges.
  if (x === 0 || y === 0) return { terrain: 'plaster_building', height: x + y === 0 ? 7 : 6, prop };
  // The raised lawn below the palace, with the gazebo.
  if (x <= 7 && y <= 7) return { terrain: 'lawn', height: 2, prop };
  // The fountain circle and the two walks crossing at it.
  const ring = Math.hypot(x - FOUNTAIN[0], y - FOUNTAIN[1]);
  if (x === FOUNTAIN[0] && y === FOUNTAIN[1]) return { terrain: 'gravel', height: 1, prop: 'fountain' };
  if (ring < 2.3 || x === FOUNTAIN[0] || y === FOUNTAIN[1]) return { terrain: 'gravel', height: 1, prop };
  // The hedge maze.
  const [mx, my] = [x - MAZE_AT[0], y - MAZE_AT[1]];
  if (mx >= 0 && my >= 0 && my < MAZE.length && mx < MAZE[my].length) {
    return MAZE[my][mx] === 'H' ? { terrain: 'hedge', height: 2 } : { terrain: 'gravel', height: 1, prop };
  }
  // The parterre: flower beds in pairs between gravel walks, back right.
  if (x >= 13 && x <= 18 && y >= 2 && y <= 8) {
    const bed = x % 3 !== 0 && y % 3 !== 2;
    return { terrain: bed ? 'flowerbed' : 'gravel', height: 1, prop };
  }
  return { terrain: 'lawn', height: 1, prop };
}

export const gardens: Theme = {
  id: 'gardens',
  name: 'Royal Gardens',
  category: 'Kingdom',
  map: () => buildMap(SEED, SIZE, place),
  focus: GAZEBO,
  zoom: 0.85,
  light: {
    background: '#d4e6f2', sky: '#eef6ff', bounce: '#4a5a40', ambient: 1.35,
    sun: '#fff6e0', sunIntensity: 2.4, sunFrom: [-5, 9, 4], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#4a86c8'], [130, '#a2c8e8'], [210, '#e0eef8'], [269, '#e8f2f8']]);
    far.sun(520, 46, 9, '#fffbe8', 3);
    far.ridge({ seed: 41, base: 214, amp: 40, period: 4, color: '#9ab4a4', shade: '#8aa494', jag: 0.06 });
    far.treeline({ rand, base: 238, color: '#7a9c78', light: '#88aa84', kind: 'round', size: 9 });
    far.mist(228, 24, '#e4eff4', 0.4);
    far.treeline({ rand, base: 258, color: '#5c8458', light: '#6a9464', kind: 'round', size: 11 });
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 9, 18, 110) };
  },
};
