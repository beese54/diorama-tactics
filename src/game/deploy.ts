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

/** Open tiles in walking order outward from `start`: nearest first, ties in a fixed order. */
function walkOrder(map: MapFile, start: Tile): Tile[] {
  const seen = new Set([start]);
  const order = [start];
  for (let i = 0; i < order.length; i++) {
    for (const [dx, dy] of EDGES) {
      const x = order[i].x + dx;
      const y = order[i].y + dy;
      const n = x >= 0 && y >= 0 && x < map.width && y < map.height ? map.tiles[y * map.width + x] : undefined;
      if (n && isOpen(n) && !seen.has(n)) {
        seen.add(n);
        order.push(n);
      }
    }
  }
  return order;
}

/**
 * The two sides at the start of a skirmish. The player gathers near the front corner (nearest
 * the opening camera, where x + y is largest), the enemy near the back one, each round the
 * good tile closest to the middle of its edge and on the nearest good tiles walking out from
 * it, so both stand on ground that joins up. Depends only on the map.
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
  const reach = walkOrder(map, playerStart);
  const joined = new Set(reach);
  const enemyStart = candidates.filter((t) => joined.has(t)).reduce((a, b) => (front(b) < front(a) ? b : a));
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
}
