import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 223;
/** The landmark: a bronze gladiator on its plinth in the middle of the arena. */
const STATUE: [number, number] = [13, 13];
/** The arena's centre and the radius of its floor; the stands climb a step per tile beyond it. */
const CENTRE: [number, number] = [13, 13];
const FLOOR = 6.5;
const TOP = 8;
/** Towards the front the stands have fallen in, leaving rubble and grass. */
const COLLAPSE = 25;
/** The hypogeum: passages under the old arena floor, open to the sky now, crossing here. */
const PASSAGES = 10;

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '13,13': 'gladiator',
  // Columns still standing on the stands, trees and cypresses rooted in them.
  '6,9': 'column', '9,5': 'column', '4,13': 'column', '13,4': 'column', '5,4': 'tree', '15,3': 'broadleaf', '3,8': 'cypress', '8,2': 'cypress',
  // The arena: fallen column drums and blocks.
  '15,9': 'pillar', '9,15': 'pillar', '16,16': 'boulder', '12,8': 'boulder',
  // The collapsed front: cypresses and rubble.
  '18,17': 'cypress', '16,19': 'cypress', '19,14': 'boulder', '13,19': 'pillar',
};

function place(x: number, y: number, rand: () => number): Cell {
  const prop = PROPS[`${x},${y}`];
  const r = Math.hypot(x - CENTRE[0], y - CENTRE[1]);
  if (x + y >= COLLAPSE && r >= FLOOR) {
    // Fallen stands: low heaps of masonry in the grass.
    const heap = valueNoise(SEED, x / 2, y / 2) > 0.55;
    return { terrain: heap ? 'ruined_wall' : rand() < 0.3 ? 'meadow' : 'plains', height: heap ? 2 : 1, prop };
  }
  if (r < FLOOR) {
    if ((x === PASSAGES || y === PASSAGES) && r < FLOOR - 1) return { terrain: 'cobblestone', height: 0, prop };
    if (x === STATUE[0] && y === STATUE[1]) return { terrain: 'flagstone', height: 1, prop };
    return { terrain: valueNoise(SEED + 5, x / 2.2, y / 2.2) > 0.64 ? 'plains' : 'arena_sand', height: 1, prop };
  }
  const height = Math.min(TOP, 2 + Math.floor(r - FLOOR));
  // Grass and moss have taken over patches of the seating.
  const overgrown = valueNoise(SEED + 9, x / 2.4, y / 2.4) > 0.66;
  return { terrain: overgrown ? 'moss' : 'seating', height, prop };
}

export const colosseum: Theme = {
  id: 'colosseum',
  name: 'Overgrown Colosseum',
  category: 'Ancient Ruins',
  map: () => buildMap(SEED, SIZE, place),
  focus: STATUE,
  zoom: 0.85,
  light: {
    background: '#dce8f0', sky: '#fff6e4', bounce: '#5a5040', ambient: 1.3,
    sun: '#fff0d4', sunIntensity: 2.5, sunFrom: [-6, 9, 3], propLights: false,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // A warm Mediterranean afternoon: hills of cypress and pine.
    far.sky([[0, '#4a86c8'], [130, '#a0c6e4'], [210, '#ecece0'], [269, '#f2eedc']]);
    far.sun(1200, 80, 10, '#fff8e0', 3);
    far.ridge({ seed: 111, base: 214, amp: 44, period: 3, color: '#a8b4a0', shade: '#98a492', jag: 0.06 });
    far.mist(200, 26, '#eeeee2', 0.4);
    far.treeline({ rand, base: 248, color: '#5a7448', light: '#6a8454', kind: 'pine', size: 12 });
    far.treeline({ rand, base: 264, color: '#4a643c', light: '#587248', kind: 'round', size: 11 });
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 9, 16, 110) };
  },
};
