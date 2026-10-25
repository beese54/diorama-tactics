import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import { tileAt } from '../map/types';
import { scenery, speckLayer } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 96;
const VENT: [number, number] = [4, 9];

/** Lava: one river from the back, one from the right, meeting in a pool at the front corner. */
function lava(x: number, y: number): boolean {
  const pool = Math.hypot(x - 17.5, y - 17.5) < 3.2;
  const west = Math.abs(x - (8 + y * 0.45 + 1.2 * Math.sin(y * 0.6))) < 0.9 && y < 16;
  const east = Math.abs(y - (5 + (19 - x) * 0.5 + Math.sin(x * 0.7))) < 0.8 && x > 11;
  // Basalt crossings keep both banks reachable.
  const ford = (west && (y === 6 || y === 13)) || (east && x === 15);
  return (pool || west || east) && !ford;
}

function place(x: number, y: number): Cell {
  if (lava(x, y)) return { terrain: 'lava', height: 0 };
  // A raised plateau carries the vent; elsewhere basalt breaks into uneven terraces.
  const vent = Math.hypot(x - VENT[0], y - VENT[1]);
  if (vent < 2.1) return { terrain: 'basalt', height: 5, prop: vent < 0.5 ? 'vent' : undefined };
  const height = 1 + Math.min(3, Math.floor(valueNoise(SEED, x / 3.5, y / 3.5) * 3.6));
  return { terrain: height <= 2 && valueNoise(SEED ^ 0x41, x / 2.5, y / 2.5) > 0.45 ? 'ash' : 'basalt', height };
}

export const volcano: Theme = {
  id: 'volcano',
  name: 'Volcanic Caldera',
  category: 'Elemental',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    // Decor once the banks are settled: embers by the lava, spires on the heights, dead trees on the ash.
    map.tiles.forEach((t) => {
      if (t.terrain === 'lava' || t.prop) return;
      const nearLava = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)?.terrain === 'lava');
      const r = t.seedRand;
      if (nearLava && r < 0.16) t.prop = 'ember_rock';
      else if (t.height >= 4 && r < 0.12) t.prop = 'basalt_spire';
      else if (t.terrain === 'ash' && r < 0.1) t.prop = 'dead_tree';
    });
    return map;
  },
  focus: VENT,
  zoom: 0.85,
  light: {
    background: '#1a0c0c', sky: '#a49aa6', bounce: '#3a1a14', ambient: 1.05,
    sun: '#ff9a60', sunIntensity: 1.6, sunFrom: [-3, 6, 5], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#140a0e'], [110, '#3a1414'], [190, '#7a2a18'], [269, '#c4501e']]);
    // The default view looks at the strip around x = 0, so the big cone stands there.
    far.volcano({ cx: 1880, base: 250, height: 170, width: 340, color: '#2c1b1a', shade: '#211413', lava: '#ff6a1a', rand });
    far.volcano({ cx: 860, base: 250, height: 110, width: 250, color: '#2a1a19', shade: '#1f1312', lava: '#ff7a24', rand });
    far.plume({ x: 1880, base: 78, height: 80, color: '#3a2828', drift: 0.8, rand });
    far.plume({ x: 860, base: 138, height: 70, color: '#3a2828', drift: 0.6, rand });
    far.ridge({ seed: 31, base: 252, amp: 36, period: 7, color: '#1f1515', shade: '#170f0f' });
    return { far: far.toCanvas(), overlay: speckLayer(SEED + 1, 5, ['#ff8a2a', '#ffb347', '#ff5a1a'], [0, -16]) };
  },
};
