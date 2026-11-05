import { isLiquid } from '../map/surface';
import { tileStats } from '../map/terrain';
import type { MapFile, Tile } from '../map/types';
import { isOpen } from './movement';
import { makeUnit, type ClassId, type Gender, type Side, type Unit } from './units';

/** Who fights: five of the six classes per side, with men and women mixed so both Union shapes turn up. */
export const ROSTER: Record<Side, { name: string; cls: ClassId; gender: Gender }[]> = {
  player: [
    { name: 'Aria', cls: 'sword', gender: 'female' },
    { name: 'Bram', cls: 'spear', gender: 'male' },
    { name: 'Corin', cls: 'axe', gender: 'male' },
    { name: 'Dela', cls: 'bow', gender: 'female' },
    { name: 'Ilse', cls: 'mage', gender: 'female' },
  ],
  enemy: [
    { name: 'Varek', cls: 'knight', gender: 'male' },
    { name: 'Sabine', cls: 'sword', gender: 'female' },
    { name: 'Gorran', cls: 'axe', gender: 'male' },
    { name: 'Petra', cls: 'spear', gender: 'female' },
    { name: 'Ulric', cls: 'bow', gender: 'male' },
  ],
};

const EDGES = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** A tile anyone could start on: open, nothing standing on it, dry. */
const free = (t: Tile) => isOpen(t) && !t.prop && !isLiquid(t);

/** The most tiles' walk from any unit to its nearest foe at the start, so the fighting starts soon. */
export const START_REACH = 12;
/**
 * The fewest tiles' walk between foes at the start: a fight needs them side by side, so no one is
 * in one before anyone moves, with room to spare (4, not more: on a narrow strip a side strings out,
 * and its tail can't be kept further off while its head stays in reach).
 */
export const START_GAP = 4;

/** Open tiles outward from `start` and how many steps' walk each is: nearest first, ties in a fixed order. */
function walkFrom(map: MapFile, start: Tile): Map<Tile, number> {
  const steps = new Map([[start, 0]]);
  const order = [start];
  for (let i = 0; i < order.length; i++) {
    for (const [dx, dy] of EDGES) {
      const x = order[i].x + dx;
      const y = order[i].y + dy;
      const n = x >= 0 && y >= 0 && x < map.width && y < map.height ? map.tiles[y * map.width + x] : undefined;
      if (n && isOpen(n) && !steps.has(n)) {
        steps.set(n, steps.get(order[i])! + 1);
        order.push(n);
      }
    }
  }
  return steps;
}

/** Open tiles in walking order outward from `start`: nearest first, ties in a fixed order. */
const walkOrder = (map: MapFile, start: Tile): Tile[] => [...walkFrom(map, start).keys()];

/**
 * The two sides at the start of a skirmish. The player gathers near the front corner (nearest
 * the opening camera, where x + y is largest), each unit on the nearest good tile walking out
 * from it. The enemy gathers the same way a short march away, towards the middle: as far off as
 * leaves every unit a foe within START_REACH tiles' walk and no two foes closer than START_GAP,
 * so the fighting starts in a turn or two. Both stand on ground that joins up. Depends only on
 * the map.
 */
export function deploy(map: MapFile): Unit[] {
  // Good tiles to start on are easy going: fields, roads, sand, scrub (not swamp or rock), or on a
  // glacier or a bog, its firmest ground.
  const open = map.tiles.filter(free);
  const easy = Math.max(2, Math.min(...open.map((t) => tileStats(t).moveCost)));
  const good = (t: Tile) => free(t) && tileStats(t).moveCost <= easy;
  const candidates = open.filter(good);
  if (candidates.length < 10) throw new Error('Too little open ground to deploy two sides.');
  const front = (t: Tile) => t.x + t.y - 0.6 * Math.abs(t.x - t.y);
  const playerStart = candidates.reduce((a, b) => (front(b) > front(a) ? b : a));
  const fromPlayer = walkFrom(map, playerStart);
  const place = (enemyStart: Tile): Unit[] => {
    const taken = new Set<Tile>();
    const side = (s: Side, start: Tile) =>
      walkOrder(map, start)
        .filter((t) => good(t) && !taken.has(t))
        .slice(0, ROSTER[s].length)
        .map((t, i) => {
          taken.add(t);
          return makeUnit({ id: `${s}-${i}`, side: s, x: t.x, y: t.y, ...ROSTER[s][i] });
        });
    return [...side('player', playerStart), ...side('enemy', enemyStart)];
  };
  // How far each unit has to walk to its nearest foe: the furthest of those, and the closest.
  const tileOf = (u: Unit) => map.tiles[u.y * map.width + u.x];
  const spread = (units: Unit[]) => {
    const walks = units.map((u) => walkFrom(map, tileOf(u)));
    const nearest = units.map((u, i) => Math.min(...units.filter((f) => f.side !== u.side).map((f) => walks[i].get(tileOf(f)) ?? Infinity)));
    return { reach: Math.max(...nearest), gap: Math.min(...nearest) };
  };
  // The enemy's gathering point: the furthest march out (towards the middle) that keeps every unit
  // in reach of a foe; nearer ones only if the ground crowds the far ones.
  let fallback: Unit[] | null = null;
  for (let march = START_REACH; march >= START_GAP; march--) {
    // The ring's tiles nearest the middle of the board first, so the two sides face each other
    // across open ground rather than along an edge; a few of them, in case the ground crowds one.
    const middle = (t: Tile) => Math.hypot(t.x - (map.width - 1) / 2, t.y - (map.height - 1) / 2);
    const ring = candidates.filter((t) => fromPlayer.get(t) === march).sort((a, b) => middle(a) - middle(b)).slice(0, 8);
    for (const start of ring) {
      const units = place(start);
      const { reach, gap } = spread(units);
      if (reach <= START_REACH && gap >= START_GAP) return units;
      if (reach <= START_REACH) fallback ??= units;
    }
  }
  if (fallback) return fallback;
  throw new Error('No ground to deploy two sides within reach of each other.');
}
