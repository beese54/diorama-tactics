import { mulberry32 } from '../util/rng';
import type { MapFile, TerrainId, Tile } from './types';

const SIZE = 32;

/**
 * Hand-placed flat layout for M1 so every terrain style can be inspected.
 * Replaced by the seeded generator in M3.
 */
export function createTestMap(seed = 1): MapFile {
  const rand = mulberry32(seed);
  const tiles: Tile[] = [];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      tiles.push({
        x,
        y,
        height: 0,
        terrain: terrainFor(x, y),
        moisture: 0.5,
        water: null,
        feature: null,
        seedRand: rand(),
      });
    }
  }
  return { version: 1, seed, width: SIZE, height: SIZE, tiles };
}

function terrainFor(x: number, y: number): TerrainId {
  const dist = (cx: number, cy: number) => Math.hypot(x - cx, y - cy);

  // Winding river running north to south.
  const riverOffset = Math.abs(x - (15 + 4 * Math.sin(y / 4.5)));
  if (riverOffset < 1) return 'deep_water';
  if (riverOffset < 2) return 'shallow_water';

  const lake = dist(26, 6);
  if (lake < 2.6) return 'deep_water';
  if (lake < 3.6) return 'shallow_water';
  if (lake < 4.8) return 'beach';

  const rocks = dist(26, 26);
  if (rocks < 1.5) return 'peak_snow';
  if (rocks < 3) return 'mountain';
  if (rocks < 4.2) return 'scree';
  if (rocks < 5.5) return 'hills';

  const swamp = dist(6, 25);
  if (swamp < 1.8) return 'bog';
  if (swamp < 3.6) return 'swamp';
  if (swamp < 5) return 'marsh';

  const forest = dist(6, 7);
  if (forest < 2.5) return 'pine_forest';
  if (forest < 4) return 'forest';
  if (forest < 5.5) return 'light_woods';

  if (y === 16) return 'road';
  if (dist(22, 15) < 1.5) return 'ruins';
  if (dist(9, 15) < 1.2) return 'crystal_field';
  if (x >= 19 && x <= 23 && y >= 19 && y <= 22) return 'farmland';
  if (dist(23, 11) < 2.5) return 'meadow';
  if (x <= 2 && y >= 12 && y <= 19) return 'badlands';
  if (x >= 29 && y >= 13 && y <= 19) return 'desert';
  return 'plains';
}
