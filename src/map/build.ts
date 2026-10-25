import { mulberry32 } from '../util/rng';
import { isBuilt, isLiquid } from './surface';
import { tileAt, type FeatureId, type MapFile, type PropId, type TerrainId, type Tile, type WaterInfo } from './types';

export interface Cell {
  terrain: TerrainId;
  height: number;
  prop?: PropId;
  /** Which way a river or canal runs (still water needs none). */
  water?: WaterInfo;
  feature?: FeatureId;
}

/** A square map from a function of tile position; `rand` is seeded per map for decor rolls. */
export function buildMap(seed: number, size: number, place: (x: number, y: number, rand: () => number) => Cell): MapFile {
  const rand = mulberry32(seed);
  const tiles: Tile[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = place(x, y, rand);
      const tile: Tile = { x, y, height: cell.height, terrain: cell.terrain, moisture: 0.5, water: cell.water ?? null, feature: cell.feature ?? null, seedRand: rand() };
      if (cell.prop) tile.prop = cell.prop;
      tiles.push(tile);
    }
  }
  return { version: 1, seed, width: size, height: size, tiles };
}

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * Banks step down to rivers, lakes and lava instead of ending in a wall: land touching a
 * liquid (diagonals included) stands at most one step above the highest liquid it touches,
 * and land further away at most one step per tile above that. Counting diagonals keeps a
 * staircase-shaped bank one connected strip, so no column drops two steps at a single
 * corner. Where a river falls from one level to the next, its banks keep to the upper
 * level, so the fall runs between rocky sides. Built ground (quays, bridges) is left as authored.
 */
export function slopeToLiquids(map: MapFile): void {
  const touching = (t: Tile) => AROUND.map(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)).filter((n): n is Tile => !!n && isLiquid(n));
  const bank = map.tiles.map((t) => !isLiquid(t) && touching(t).length > 0);
  const limit = map.tiles.map((t, i) => (isLiquid(t) ? t.height : bank[i] ? Math.max(...touching(t).map((n) => n.height)) + 1 : Infinity));
  for (let changed = true; changed; ) {
    changed = false;
    map.tiles.forEach((t, i) => {
      if (isLiquid(t) || bank[i]) return;
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
