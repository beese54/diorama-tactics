import { mulberry32 } from '../util/rng';
import { isLiquid } from './surface';
import { IMPASSABLE, TERRAIN } from './terrain';
import { tileAt, type MapFile, type Tile } from './types';

/** Rivers shorter than this read as puddles; a source is only picked if its course is at least this long. */
const MIN_RIVER = 10;
/** A second river starts at least this far (in tiles, diagonals count as one) from the first. */
const SECOND_APART = 7;
/** Sources keep this far in from the board's edge, so a river has room to run. */
const SOURCE_MARGIN = 3;
/** Rivers rise no higher than this: springs on the snowy peaks would ring themselves with more peaks. */
const MAX_SOURCE_HEIGHT = 6;
/** Rivers at least this long get a second bridge, and bridges stand at least this far apart (tiles, diagonals count as one). */
const LONG_RIVER = 16;
const BRIDGE_APART = 5;

const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND = [...EDGES, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** A river's course from source to mouth, as tile indices. */
export type River = number[];

/** Smallest-first queue of tile indices. */
class Queue {
  private readonly items: number[] = [];
  constructor(private readonly key: Float64Array) {}
  get size(): number {
    return this.items.length;
  }
  push(i: number): void {
    const { items, key } = this;
    items.push(i);
    for (let k = items.length - 1; k > 0; ) {
      const parent = (k - 1) >> 1;
      if (key[items[parent]] <= key[items[k]]) break;
      [items[parent], items[k]] = [items[k], items[parent]];
      k = parent;
    }
  }
  pop(): number {
    const { items, key } = this;
    const top = items[0];
    const last = items.pop()!;
    if (items.length === 0) return top;
    items[0] = last;
    for (let k = 0; ; ) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < items.length && key[items[l]] < key[items[m]]) m = l;
      if (r < items.length && key[items[r]] < key[items[m]]) m = r;
      if (m === k) break;
      [items[m], items[k]] = [items[k], items[m]];
      k = m;
    }
    return top;
  }
}

/**
 * Where each tile drains: the next tile on its way down to an outlet (lake, sea, or the
 * board's front edges), or -1 for outlets. Flooded upward from the outlets in order of
 * elevation, so every tile drains along the lowest possible route and hollows never trap
 * a river: it carves through the rim instead.
 */
function drainage(map: MapFile, elevation: readonly number[], outlet: (t: Tile) => boolean): Int32Array {
  const size = map.width;
  const next = new Int32Array(size * size).fill(-2);
  const level = new Float64Array(size * size);
  const queue = new Queue(level);
  map.tiles.forEach((t, i) => {
    if (!outlet(t)) return;
    next[i] = -1;
    level[i] = elevation[i];
    queue.push(i);
  });
  while (queue.size > 0) {
    const i = queue.pop();
    for (const [dx, dy] of EDGES) {
      const n = tileAt(map, (i % size) + dx, Math.floor(i / size) + dy);
      if (!n) continue;
      const j = n.y * size + n.x;
      if (next[j] !== -2) continue;
      next[j] = i;
      level[j] = Math.max(elevation[j], level[i]);
      queue.push(j);
    }
  }
  return next;
}

/**
 * Carves one or two rivers into a generated map. Each starts at a spring on high ground
 * and follows the drainage down to a lake, the sea or the front edge of the board,
 * joining an earlier river if it meets one. A river sits one step below every bank, only
 * ever drops along its course, and each drop is a waterfall. Rivers are shallow, so they
 * slow a unit down but never stop it. Returns the courses, source first.
 */
export function carveRivers(map: MapFile, elevation: readonly number[], count: number): River[] {
  const size = map.width;
  const rand = mulberry32(map.seed ^ 0x71fe);
  const front = (t: Tile) => t.x === size - 1 || t.y === size - 1;
  const next = drainage(map, elevation, (t) => isLiquid(t) || front(t));
  const course = (i: number) => {
    const path = [i];
    while (next[path[path.length - 1]] >= 0) path.push(next[path[path.length - 1]]);
    return path;
  };

  const rivers: River[] = [];
  const river = new Map<number, number>(); // tile index -> water height
  for (let r = 0; r < count; r++) {
    const near = (i: number) => [...river.keys()].some((j) => Math.max(Math.abs((i % size) - (j % size)), Math.abs(Math.floor(i / size) - Math.floor(j / size))) < SECOND_APART);
    const candidates = map.tiles
      .map((t, i) => ({ t, i, score: elevation[i] + 0.15 * rand() }))
      .filter(({ t, i }) =>
        !isLiquid(t) && t.height >= 3 && t.height <= MAX_SOURCE_HEIGHT && !near(i) &&
        t.x >= SOURCE_MARGIN && t.y >= SOURCE_MARGIN && t.x < size - SOURCE_MARGIN && t.y < size - SOURCE_MARGIN)
      .map((c) => {
        // The course up to the outlet, or up to where it meets an earlier river.
        const full = course(c.i);
        const meets = full.findIndex((j) => river.has(j));
        return { ...c, path: meets >= 0 ? full.slice(0, meets + 1) : full };
      })
      .sort((a, b) => b.score - a.score);
    const hasMouth = (path: number[]) => isLiquid(map.tiles[path[path.length - 1]]) || river.has(path[path.length - 1]);
    const pick = candidates.find((c) => c.path.length - (hasMouth(c.path) ? 1 : 0) >= MIN_RIVER);
    if (!pick) break;

    // The mouth (a lake, the sea or the river joined) isn't part of the river; a river
    // reaching the front edge instead runs off the board.
    const mouth = hasMouth(pick.path) ? map.tiles[pick.path[pick.path.length - 1]] : null;
    const path = mouth ? pick.path.slice(0, -1) : pick.path;
    // Each tile sits a step below every bank around it and no higher than the tile upstream;
    // a tributary never falls below the river it joins.
    const floor = mouth && river.has(mouth.y * size + mouth.x) ? mouth.height : 0;
    const onPath = new Set(path);
    const heights: number[] = [];
    for (const i of path) {
      const t = map.tiles[i];
      const banks = AROUND.map(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)).filter((n): n is Tile => !!n && !isLiquid(n) && !onPath.has(n.y * size + n.x));
      const below = Math.min(t.height, ...banks.map((n) => n.height)) - 1;
      heights.push(Math.max(floor, Math.min(heights.at(-1) ?? Infinity, below)));
    }
    path.forEach((i, k) => {
      const t = map.tiles[i];
      const to = k + 1 < path.length ? map.tiles[path[k + 1]] : mouth;
      // Off the board, the river spills over the diorama's edge.
      const flow: [number, number] = to ? [to.x - t.x, to.y - t.y] : t.x === size - 1 ? [1, 0] : [0, 1];
      const falls = k + 1 < path.length ? heights[k + 1] < heights[k] : !to || to.height < heights[k];
      t.terrain = 'shallow_water';
      t.height = heights[k];
      t.water = { kind: falls ? 'waterfall' : 'river', flow };
      river.set(i, heights[k]);
    });
    rivers.push(path);
  }
  // Banks stand at least a step above the water, so no river spills over its side.
  for (const [i, h] of river) {
    const t = map.tiles[i];
    for (const [dx, dy] of AROUND) {
      const n = tileAt(map, t.x + dx, t.y + dy);
      if (n && !isLiquid(n)) n.height = Math.max(n.height, h + 1);
    }
  }
  return rivers;
}

const walkable = (t: Tile | undefined) => !!t && !isLiquid(t) && TERRAIN[t.terrain].moveCost < IMPASSABLE;

/**
 * One bridge per river, two on long ones, spread along its course and apart from every
 * other bridge: on a straight stretch away from waterfalls, between two walkable banks one
 * step above the water. Wooden in the lowlands, stone in the hills.
 */
export function placeBridges(map: MapFile, rivers: readonly River[]): void {
  const size = map.width;
  for (const path of rivers) {
    const tiles = path.map((i) => map.tiles[i]);
    const ok = tiles.map((t, k) => {
      if (k === 0 || k === tiles.length - 1 || t.x === 0 || t.y === 0 || t.x === size - 1 || t.y === size - 1) return false;
      const [prev, next] = [tiles[k - 1], tiles[k + 1]];
      if (prev.x + next.x !== 2 * t.x || prev.y + next.y !== 2 * t.y) return false; // not straight
      if (prev.height !== t.height || next.height !== t.height || t.water?.kind !== 'river') return false;
      const [dx, dy] = prev.x === t.x ? [1, 0] : [0, 1];
      const ends = [tileAt(map, t.x + dx, t.y + dy), tileAt(map, t.x - dx, t.y - dy)];
      return ends.every((e) => walkable(e) && e!.height === t.height + 1);
    });
    const count = path.length >= LONG_RIVER ? 2 : 1;
    for (let b = 0; b < count; b++) {
      const aim = ((b + 0.5) / count) * (tiles.length - 1);
      const best = tiles
        .map((t, k) => ({ t, k }))
        .filter(({ t, k }) => ok[k] && !map.tiles.some((o) => o.feature && Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) < BRIDGE_APART))
        .sort((a, b) => Math.abs(a.k - aim) - Math.abs(b.k - aim))[0];
      if (best) best.t.feature = best.t.height <= 1 ? 'bridge_wood' : 'bridge_stone';
    }
  }
}
