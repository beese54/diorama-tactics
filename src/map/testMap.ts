import { mulberry32 } from '../util/rng';
import { slopeToLiquids } from './build';
import type { MapFile, TerrainId, Tile, WaterInfo } from './types';

const SIZE = 32;

/**
 * Hand-placed layout for M1/M2 so every terrain style and height can be inspected.
 * Replaced by the seeded generator in M3.
 */
export function createTestMap(seed = 1): MapFile {
  const rand = mulberry32(seed);
  const tiles: Tile[] = [];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [terrain, height] = place(x, y);
      tiles.push({ x, y, height, terrain, moisture: 0.5, water: waterAt(x, y, terrain), feature: null, seedRand: rand() });
    }
  }
  const map: MapFile = { version: 1, seed, width: SIZE, height: SIZE, tiles };
  slopeToLiquids(map);
  return map;
}

/** River centreline: x at a given y. The river runs south, toward the front of the opening view. */
const riverX = (y: number) => 15 + 4 * Math.sin(y / 4.5);

/** The river runs along its winding centreline; the lake is still. */
function waterAt(x: number, y: number, terrain: TerrainId): WaterInfo | null {
  if (terrain !== 'deep_water' && terrain !== 'shallow_water') return null;
  if (Math.abs(x - riverX(y)) >= 2) return { kind: 'lake', flow: [0, 0] };
  const dx = (4 / 4.5) * Math.cos(y / 4.5);
  const length = Math.hypot(dx, 1);
  return { kind: 'river', flow: [Math.round((dx / length) * 100) / 100, Math.round(100 / length) / 100] };
}

/** Terrain and its natural height (0-8 steps) for one tile. */
function place(x: number, y: number): [TerrainId, number] {
  const dist = (cx: number, cy: number) => Math.hypot(x - cx, y - cy);

  // Winding river running north to south; water sits at the lowest level.
  const riverOffset = Math.abs(x - riverX(y));
  if (riverOffset < 1) return ['deep_water', 0];
  if (riverOffset < 2) return ['shallow_water', 0];

  const lake = dist(26, 6);
  if (lake < 2.6) return ['deep_water', 0];
  if (lake < 3.6) return ['shallow_water', 0];
  if (lake < 4.8) return ['beach', 1];

  // Mountain: hills climb through scree and rock to a snowy summit.
  const rocks = dist(26, 26);
  if (rocks < 1.5) return ['peak_snow', 8];
  if (rocks < 3) return ['mountain', rocks < 2.25 ? 7 : 6];
  if (rocks < 4.2) return ['scree', rocks < 3.6 ? 5 : 4];
  if (rocks < 5.5) return ['hills', 3];

  // Swamp lies in a low, wet basin.
  const swamp = dist(6, 25);
  if (swamp < 1.8) return ['bog', 1];
  if (swamp < 3.6) return ['swamp', 1];
  if (swamp < 5) return ['marsh', 1];

  // Forest grows on a rise, densest and highest at its heart.
  const forest = dist(6, 7);
  if (forest < 2.5) return ['pine_forest', 4];
  if (forest < 4) return ['forest', 3];
  if (forest < 5.5) return ['light_woods', 2];

  if (y === 16) return ['road', 2];
  if (dist(22, 15) < 1.5) return ['ruins', 3];
  if (dist(9, 15) < 1.2) return ['crystal_field', 2];
  if (x >= 19 && x <= 23 && y >= 19 && y <= 22) return ['farmland', 2];
  if (dist(23, 11) < 2.5) return ['meadow', 2];
  // Badlands mesas: flat-topped red rock stepping up toward the map edge.
  if (x <= 2 && y >= 12 && y <= 19) return ['badlands', x === 0 ? 5 : x === 1 ? 4 : 3];
  // Small dunes.
  if (x >= 29 && y >= 13 && y <= 19) return ['desert', (x + y) % 3 === 0 ? 3 : 2];

  // Gently rolling plains.
  const roll = Math.sin(x * 0.45 + 1) * Math.cos(y * 0.38);
  return ['plains', roll > 0.55 ? 3 : 2];
}

