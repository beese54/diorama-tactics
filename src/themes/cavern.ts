import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { scenery, speckLayer } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 229;
/** The landmark: a towering crystal spire on a rock outcrop in the middle of the cavern. */
const SPIRE: [number, number] = [11, 8];
/** A still, dark pool in the front-left hollow. */
const POOL: [number, number] = [5, 14];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '11,8': 'crystal_spire',
  // Crystal clusters for cover, stalagmites, and glowcaps by the water.
  '6,6': 'crystal_cluster', '15,5': 'crystal_cluster', '16,13': 'crystal_cluster', '9,16': 'crystal_cluster', '13,17': 'crystal_cluster', '4,9': 'crystal_cluster',
  '8,4': 'stalagmite', '17,9': 'stalagmite', '12,13': 'stalagmite', '3,17': 'stalagmite', '18,17': 'stalagmite',
  '8,12': 'glow_mushroom', '2,12': 'glow_mushroom', '14,15': 'glow_mushroom', '10,11': 'glow_mushroom', '16,3': 'glow_mushroom',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  // The cavern's walls close the back, bulging in here and there.
  const bulge = valueNoise(SEED, x / 2.5, y / 2.5) > 0.6 ? 1 : 0;
  if (Math.min(x, y) <= 1 + bulge) return { terrain: 'cliff', height: 9 };
  if (Math.hypot(x - SPIRE[0], y - SPIRE[1]) < 2) return { terrain: 'cave_floor', height: 4, prop };
  const pool = Math.hypot(x - POOL[0], y - POOL[1]);
  if (pool < 2.8) return { terrain: pool < 1.3 ? 'deep_water' : 'shallow_water', height: 0, water: { kind: 'lake', flow: [0, 0] }, prop: pool < 1.3 ? undefined : prop };
  // Uneven floor in shelves, glittering with crystal where the seams come up.
  const height = 1 + Math.min(2, Math.floor(valueNoise(SEED + 1, x / 3.2, y / 3.2) * 3));
  const seam = valueNoise(SEED + 2, x / 2.2, y / 2.2) > 0.62;
  return { terrain: seam ? 'crystal_field' : 'cave_floor', height, prop };
}

export const cavern: Theme = {
  id: 'cavern',
  name: 'Crystal Cavern',
  category: 'Elemental',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    return map;
  },
  focus: SPIRE,
  zoom: 0.85,
  light: {
    background: '#08070e', sky: '#7a7ab8', bounce: '#221a34', ambient: 1.25,
    sun: '#9a9ae0', sunIntensity: 0.85, sunFrom: [-3, 10, 2], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    // Deep underground: darkness, the cave roof hung with stalactites, a far wall of rock.
    far.sky([[0, '#06060c'], [140, '#0e0c1a'], [230, '#16122a'], [269, '#1a1430']]);
    far.stalactites({ rand, color: '#1a1828', light: '#2e2c44', maxLength: 80, count: 60 });
    far.ridge({ seed: 131, base: 232, amp: 60, period: 6, color: '#1a1828', shade: '#141220', jag: 0.2 });
    return { far: far.toCanvas(), overlay: speckLayer(SEED + 1, 3, ['#7ad8ff', '#b08aff', '#80ffc0'], [0, -6]) };
  },
};
