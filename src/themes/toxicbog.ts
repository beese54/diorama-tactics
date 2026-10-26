import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { mistLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 241;
/** The landmark: a giant toadstool on the biggest hummock, glowing over the bog. */
const TOADSTOOL: [number, number] = [9, 9];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '9,9': 'toadstool',
  // Dead and drowned trees, gas vents, bones, glowcaps.
  '4,4': 'dead_tree', '15,3': 'dead_tree', '3,12': 'dead_tree', '16,11': 'dead_tree', '12,17': 'dead_tree',
  '6,16': 'snag', '17,15': 'snag', '13,5': 'snag',
  '7,6': 'gas_vent', '14,13': 'gas_vent', '5,14': 'gas_vent',
  '11,11': 'bones', '17,7': 'bones', '8,18': 'bones',
  '10,7': 'glow_mushroom', '3,7': 'glow_mushroom', '15,17': 'glow_mushroom', '12,9': 'glow_mushroom',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  // Pools of sludge wherever the ground sinks; hummocks of firmer bog between them.
  const ground = valueNoise(SEED, x / 3.6, y / 3.6) + 0.12 * (valueNoise(SEED + 1, x / 1.6, y / 1.6) - 0.5);
  const nearToadstool = Math.hypot(x - TOADSTOOL[0], y - TOADSTOOL[1]) < 2.2;
  if (!nearToadstool && ground < 0.36) return { terrain: 'toxic_sludge', height: 0, prop: undefined };
  const height = nearToadstool ? 3 : ground > 0.66 ? 2 : 1;
  const terrain = height >= 2 ? 'marsh' : valueNoise(SEED + 2, x / 2, y / 2) > 0.5 ? 'bog' : 'swamp';
  return { terrain, height, prop };
}

export const toxicbog: Theme = {
  id: 'toxicbog',
  name: 'Toxic Bog',
  category: 'Elemental',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    // Props never stand in the sludge (it may have spread under one when the banks settled).
    for (const t of map.tiles) if (t.terrain === 'toxic_sludge') delete t.prop;
    return map;
  },
  focus: TOADSTOOL,
  zoom: 0.85,
  light: {
    background: '#141a10', sky: '#a8c890', bounce: '#2a3418', ambient: 1.2,
    sun: '#c8e0a0', sunIntensity: 1.1, sunFrom: [-5, 8, 4], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // A poisoned dusk: a sickly sky, dead woods, fumes lying low.
    far.sky([[0, '#1a2014'], [120, '#2e3a22'], [200, '#4e5e34'], [269, '#5e6e3c']]);
    far.sun(1300, 140, 9, '#d8f0a0', 2.4);
    far.ridge({ seed: 161, base: 226, amp: 22, period: 4, color: '#2a3220', shade: '#22281a', jag: 0.08 });
    far.treeline({ rand, base: 246, color: '#1e2418', light: '#262e1e', kind: 'pine', size: 12 });
    far.mist(214, 40, '#8ab060', 0.3);
    return { far: far.toCanvas(), overlay: mistLayer(170, 56, '#9ac070', 0.25) };
  },
};
