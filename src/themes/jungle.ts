import { valueNoise } from '../util/noise';
import { buildMap, slopeToLiquids, type Cell } from '../map/build';
import { mistLayer, scenery } from './scenery';
import type { Theme } from './types';

const SIZE = 20;
const SEED = 85;
const APEX = 9;

/** Distance to the stream that cuts across the front corner. */
const stream = (x: number, y: number) => Math.abs(x + y - 30.5 - 1.6 * Math.sin(x * 0.55));

function place(x: number, y: number, rand: () => number): Cell {
  // The stepped temple: rings climbing to the altar on its one-tile summit.
  const ring = Math.max(Math.abs(x - APEX), Math.abs(y - APEX));
  if (ring <= 4) return { terrain: 'temple_stone', height: 6 - ring, prop: ring === 0 ? 'altar' : undefined };
  // Broken pillars stand guard at the temple's foot.
  if (ring === 5 && Math.abs(x - APEX) === Math.abs(y - APEX)) return { terrain: 'jungle_floor', height: 1, prop: 'pillar' };

  if (stream(x, y) < 0.9 && x > 6 && y > 6) return { terrain: stream(x, y) < 0.45 ? 'deep_water' : 'shallow_water', height: 0 };

  const height = 1 + (valueNoise(SEED, x / 2.6, y / 2.6) > 0.62 ? 1 : 0);
  // Jungle is thickest at the back of the board and thins towards the front, so units stay visible.
  const back = 1 - (x + y) / (2 * SIZE - 2);
  const roll = rand();
  const prop = ring <= 5 ? undefined : roll < 0.08 + back * 0.5 ? 'jungle_tree' : roll < 0.3 + back * 0.3 ? 'fern' : undefined;
  return { terrain: 'jungle_floor', height, prop };
}

export const jungle: Theme = {
  id: 'jungle',
  name: 'Jungle Temple',
  category: 'Ancient Ruins',
  map() {
    const map = buildMap(SEED, SIZE, place);
    slopeToLiquids(map);
    return map;
  },
  focus: [APEX, APEX],
  zoom: 0.85,
  light: {
    background: '#cfe0c8', sky: '#eef6dc', bounce: '#3a4a2a', ambient: 1.25,
    sun: '#fff0c8', sunIntensity: 2.1, sunFrom: [-5, 9, 4], propLights: true,
  },
  backdrop() {
    const { far, rand } = scenery(SEED);
    far.sky([[0, '#6fa496'], [140, '#c2dcc0'], [220, '#e2ecd2'], [269, '#e8efd8']]);
    far.sun(900, 60, 10, '#fffbe2', 3);
    far.temples({ base: 214, color: '#9cb59a', at: [280, 1180, 1640] });
    far.canopy({ rand, base: 220, color: '#86a688', light: '#96b694', size: 22 });
    far.mist(196, 40, '#e8f2e2', 0.6);
    far.canopy({ rand, base: 244, color: '#4f7a4c', light: '#62904f', size: 28 });
    return { far: far.toCanvas(), overlay: mistLayer(170, 46, '#eef6ea', 0.35) };
  },
};
