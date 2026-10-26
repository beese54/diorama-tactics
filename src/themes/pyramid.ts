import { valueNoise } from '../util/noise';
import { buildMap, type Cell } from '../map/build';
import type { PropId } from '../map/types';
import { cloudLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 199;
/**
 * The pyramid is far bigger than the board: its apex stands by the back corner and only its
 * two front faces fit, stepping down a level per tile from the top.
 */
const APEX: [number, number] = [2, 2];
const TOP = 9;
/** A raised causeway runs from the pyramid's south face out to the front edge, lined with ram sphinxes. */
const CAUSEWAY = [6, 7, 8];
/** The landmark: an obelisk on the causeway, just out from the pyramid's foot. */
const OBELISK: [number, number] = [7, 11];

/** Hand-placed decor, keyed "x,y". */
const PROPS: Record<string, PropId> = {
  '7,11': 'obelisk',
  '5,13': 'ram_sphinx', '9,13': 'ram_sphinx', '5,15': 'ram_sphinx', '9,15': 'ram_sphinx', '5,17': 'ram_sphinx', '9,17': 'ram_sphinx',
  '14,14': 'colossal_head', '13,6': 'pillar', '15,8': 'pillar', '16,11': 'pillar', '2,16': 'boulder', '17,17': 'boulder', '12,18': 'pillar',
};

function place(x: number, y: number): Cell {
  const prop = PROPS[`${x},${y}`];
  const d = Math.max(Math.abs(x - APEX[0]), Math.abs(y - APEX[1]));
  if (TOP - d >= 2) return { terrain: 'pyramid', height: TOP - d, prop };
  // The causeway, a step above the sand, three tiles wide.
  if (CAUSEWAY.includes(x) && y > APEX[1]) return { terrain: 'sand_paving', height: 2, prop };
  // Dunes rolling across the rest.
  const dune = valueNoise(SEED, x / 3.5, y / 3.5);
  return { terrain: 'desert', height: dune > 0.62 ? 2 : 1, prop };
}

export const pyramid: Theme = {
  id: 'pyramid',
  name: 'Desert Pyramid',
  category: 'Ancient Ruins',
  map: () => buildMap(SEED, SIZE, place),
  focus: OBELISK,
  zoom: 0.85,
  light: {
    background: '#f0dcb4', sky: '#fff2d8', bounce: '#8a6a40', ambient: 1.3,
    sun: '#ffe0a8', sunIntensity: 2.7, sunFrom: [-8, 7, 3], propLights: false,
  },
  backdrop() {
    const { far } = scenery(SEED);
    // Late afternoon over the desert, the sun low and gold.
    far.sky([[0, '#4c84c0'], [120, '#9cc0dc'], [200, '#f0d8b0'], [269, '#f4dcb4']]);
    far.sun(1500, 140, 11, '#fff2c8', 3);
    far.pyramids({ base: 214, color: '#d8b884', shade: '#b89868', at: [[300, 34], [380, 22], [1180, 28], [1700, 18]] });
    far.mist(196, 24, '#f4e2c0', 0.5);
    far.ridge({ seed: 101, base: 236, amp: 14, period: 5, color: '#dcc08c', shade: '#c8aa78', jag: 0.02 });
    far.ridge({ seed: 103, base: 258, amp: 10, period: 7, color: '#d4b47c', shade: '#c0a06c', jag: 0.02 });
    return { far: far.toCanvas(), overlay: cloudLayer(SEED + 1, 5, 14, 90) };
  },
};
