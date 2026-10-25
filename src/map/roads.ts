import { inside, type Settlement } from './settlements';
import { isLiquid } from './surface';
import { bridgeOf, IMPASSABLE, TERRAIN } from './terrain';
import { tileAt, type MapFile, type Tile } from './types';

/** A road climbs at most this many steps from one tile to the next; steeper ground is gone around. */
const MAX_CLIMB = 2;
/** Extra cost per step of climb, so roads wind along the contours. */
const CLIMB_COST = 1.5;
/** Following an existing road is cheap, so roads merge rather than run side by side. */
const ROAD_COST = 0.4;
/** Crossing a river: cheap over an existing bridge, dearer where a new one must be built. */
const OLD_BRIDGE_COST = 1.5;
const NEW_BRIDGE_COST = 6;

const EDGES: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** One move along a road: to the next tile, maybe over a river tile it bridges. */
interface Step {
  to: number;
  over: number;
  cost: number;
}

/**
 * Roads: from the main settlement to the second (if any), and out to the two board edges
 * it reaches most cheaply. Each follows the cheapest gentle route (slopes and rough ground
 * cost more; existing roads are cheap) and never enters another footprint except at a gate.
 * It crosses a river only straight over a single river tile between level banks, on the
 * bridge already there or on a new one. Road tiles are fast to move on.
 */
export function placeRoads(map: MapFile, settlements: readonly Settlement[]): void {
  if (!settlements.length) return;
  const [main, ...others] = settlements;
  const size = map.width;
  for (const other of others) {
    const { cost, from } = route(map, settlements, main.gates);
    const targets = other.gates.map(index(map));
    const end = targets.filter((i) => cost[i] < Infinity).sort((a, b) => cost[a] - cost[b])[0];
    if (end !== undefined) build(map, from, end);
  }
  const { cost, from } = route(map, settlements, main.gates);
  const sides = [
    (t: Tile) => t.y === 0, (t: Tile) => t.x === size - 1, (t: Tile) => t.y === size - 1, (t: Tile) => t.x === 0,
  ].map((onSide) => map.tiles.map((_, i) => i).filter((i) => onSide(map.tiles[i]) && cost[i] < Infinity && !isLiquid(map.tiles[i])).sort((a, b) => cost[a] - cost[b])[0]);
  const exits = sides.filter((i): i is number => i !== undefined).sort((a, b) => cost[a] - cost[b]).slice(0, 2);
  for (const end of exits) build(map, from, end);
}

const index = (map: MapFile) => (t: Tile) => t.y * map.width + t.x;

/** Cheapest routes from the gates to everywhere (Dijkstra): cost, and for each tile the step that reached it. */
function route(map: MapFile, settlements: readonly Settlement[], gates: readonly Tile[]) {
  const n = map.tiles.length;
  const cost = new Array<number>(n).fill(Infinity);
  const from = new Array<{ prev: number; over: number } | null>(n).fill(null);
  const done = new Uint8Array(n);
  const gateSet = new Set(settlements.flatMap((s) => s.gates).map(index(map)));
  for (const g of gates) cost[index(map)(g)] = 0;
  for (;;) {
    let c = -1;
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (c < 0 || cost[i] < cost[c])) c = i;
    if (c < 0) break;
    done[c] = 1;
    for (const step of steps(map, settlements, gateSet, c)) {
      if (cost[c] + step.cost < cost[step.to]) {
        cost[step.to] = cost[c] + step.cost;
        from[step.to] = { prev: c, over: step.over };
      }
    }
  }
  return { cost, from };
}

function steps(map: MapFile, settlements: readonly Settlement[], gates: ReadonlySet<number>, i: number): Step[] {
  const here = map.tiles[i];
  const out: Step[] = [];
  const open = (t: Tile | undefined): boolean =>
    !!t && !isLiquid(t) && TERRAIN[t.terrain].moveCost < IMPASSABLE && TERRAIN[t.terrain].shape !== 'built' && !(t.prop && t.prop === 'well') &&
    (gates.has(t.y * map.width + t.x) || !settlements.some((s) => inside(s, t)));
  for (const [dx, dy] of EDGES) {
    const next = tileAt(map, here.x + dx, here.y + dy);
    if (!next) continue;
    if (open(next)) {
      const climb = Math.abs(next.height - here.height);
      if (climb > MAX_CLIMB) continue;
      const rough = next.terrain === 'road' ? ROAD_COST : 1 + 0.7 * (TERRAIN[next.terrain].moveCost - 1);
      out.push({ to: next.y * map.width + next.x, over: -1, cost: rough + CLIMB_COST * climb });
      continue;
    }
    // A river tile crossed square-on, between two banks one step above it.
    const far = tileAt(map, here.x + 2 * dx, here.y + 2 * dy);
    const kind = next.water?.kind;
    if (!far || !open(far) || (kind !== 'river' && !bridgeOf(next)) || !next.water) continue;
    const [fx, fy] = next.water.flow;
    if (fx * dx + fy * dy !== 0) continue;
    if (here.height !== next.height + 1 || far.height !== next.height + 1) continue;
    out.push({ to: far.y * map.width + far.x, over: next.y * map.width + next.x, cost: bridgeOf(next) ? OLD_BRIDGE_COST : NEW_BRIDGE_COST });
  }
  return out;
}

/** Lays road along the cheapest route back from `end`, bridging rivers where it crosses them. Built gates stay as they are. */
function build(map: MapFile, from: ReadonlyArray<{ prev: number; over: number } | null>, end: number): void {
  for (let i = end; ; ) {
    const t = map.tiles[i];
    if (TERRAIN[t.terrain].shape !== 'built') {
      t.terrain = 'road';
      t.prop = undefined;
    }
    const step = from[i];
    if (!step) break;
    if (step.over >= 0) {
      const river = map.tiles[step.over];
      river.feature ??= river.height <= 1 ? 'bridge_wood' : 'bridge_stone';
    }
    i = step.prev;
  }
}
