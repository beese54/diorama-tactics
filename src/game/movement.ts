import { PROPS } from '../map/props';
import { IMPASSABLE, tileStats } from '../map/terrain';
import type { MapFile, Tile } from '../map/types';
import type { Unit } from './units';

/**
 * The cheapest way to a tile: what it costs from the MOV pool, the tile index it is entered
 * from (−1 at the start), and whether the mover may end its move there (not on an ally).
 */
export interface Step {
  cost: number;
  from: number;
  stop: boolean;
}

const EDGES = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** Whether anyone can stand on the tile at all: not impassable ground, nor a blocking prop such as a fountain or a statue. */
export function isOpen(tile: Tile): boolean {
  return tileStats(tile).moveCost < IMPASSABLE && !(tile.prop && PROPS[tile.prop].blocks);
}

/**
 * Every tile `mover` can reach with `pool` MOV to spend, keyed by tile index. Entering a tile
 * costs its move cost; height never matters (the maps are built so every open tile can be
 * walked to). Enemies bar the way; allies can be passed through but not stopped on, so their
 * tiles come back with `stop: false`. The start tile is included at cost 0.
 */
export function moveRange(map: MapFile, units: readonly Unit[], mover: Unit, pool: number): Map<number, Step> {
  const at = new Map(units.filter((u) => u !== mover && u.morale > 0).map((u) => [u.y * map.width + u.x, u]));
  const start = mover.y * map.width + mover.x;
  const best = new Map<number, Step>([[start, { cost: 0, from: -1, stop: true }]]);
  // Dijkstra with a plain array as the queue: move costs are small and so are the boards.
  const open = [start];
  while (open.length) {
    let k = 0;
    for (let i = 1; i < open.length; i++) if (best.get(open[i])!.cost < best.get(open[k])!.cost) k = i;
    const here = open.splice(k, 1)[0];
    const { cost } = best.get(here)!;
    const [hx, hy] = [here % map.width, Math.floor(here / map.width)];
    for (const [dx, dy] of EDGES) {
      const [x, y] = [hx + dx, hy + dy];
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const next = y * map.width + x;
      const tile = map.tiles[next];
      const other = at.get(next);
      if (!isOpen(tile) || (other && other.side !== mover.side)) continue;
      const total = cost + tileStats(tile).moveCost;
      if (total > pool || total >= (best.get(next)?.cost ?? Infinity)) continue;
      if (!best.has(next)) open.push(next);
      best.set(next, { cost: total, from: here, stop: !at.has(next) });
    }
  }
  return best;
}

/** The tiles the mover may end its move on. */
export const stopsIn = (range: Map<number, Step>): number[] => [...range].filter(([, s]) => s.stop).map(([i]) => i);

/** The tiles walked from the start to `index` (both included), or [] if the mover can't end there. */
export function pathTo(range: Map<number, Step>, index: number): number[] {
  if (!range.get(index)?.stop) return [];
  const path: number[] = [];
  for (let i = index; i !== -1; i = range.get(i)!.from) path.unshift(i);
  return path;
}
