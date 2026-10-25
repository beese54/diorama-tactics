import { mulberry32 } from '../util/rng';
import { isBuilt, isLiquid } from './surface';
import { tileAt, type MapFile, type PropId, type TerrainId, type Tile } from './types';

export interface Cell {
  terrain: TerrainId;
  height: number;
  prop?: PropId;
}

/** A square map from a function of tile position; `rand` is seeded per map for decor rolls. */
export function buildMap(seed: number, size: number, place: (x: number, y: number, rand: () => number) => Cell): MapFile {
  const rand = mulberry32(seed);
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = place(x, y, rand);
      const tile: Tile = { x, y, height: cell.height, terrain: cell.terrain, moisture: 0.5, water: null, feature: null, seedRand: rand() };
      if (cell.prop) tile.prop = cell.prop;
      tiles.push(tile);
    }
  }
  return { version: 1, seed, width: size, height: size, tiles };
}

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Land can stand no higher above a liquid than its distance from it (in tiles, diagonals
 * included), so banks step down to rivers, lakes and lava instead of ending in a wall.
 * Counting diagonals keeps a staircase-shaped bank one connected strip, so no column
 * drops two steps at a single corner. Built ground (quays, bridges) is left as authored.
 */
export function slopeToLiquids(map: MapFile): void {
  const limit = map.tiles.map((t) => (isLiquid(t) ? t.height : Infinity));
  for (let changed = true; changed; ) {
    changed = false;
    map.tiles.forEach((t, i) => {
      for (const [dx, dy] of AROUND) {
        const n = tileAt(map, t.x + dx, t.y + dy);
        if (n && limit[n.y * map.width + n.x] + 1 < limit[i]) {
          limit[i] = limit[n.y * map.width + n.x] + 1;
          changed = true;
        }
      }
    });
  }
  map.tiles.forEach((t, i) => {
    if (!isLiquid(t) && !isBuilt(t)) t.height = Math.min(t.height, limit[i]);
  });
}
