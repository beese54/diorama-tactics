import { describe, expect, it } from 'vitest';
import { generateMap } from '../map/generator';
import { isLiquid } from '../map/surface';
import type { MapFile } from '../map/types';
import { THEMES } from '../themes';
import { deploy, ROSTER } from './deploy';
import { isOpen } from './movement';

const EDGES = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** Tile indices reachable on foot from `start`, ignoring units. */
function walkable(map: MapFile, start: number): Set<number> {
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = [queue[i] % map.width, Math.floor(queue[i] / map.width)];
    for (const [dx, dy] of EDGES) {
      const n = (y + dy) * map.width + x + dx;
      if (x + dx < 0 || y + dy < 0 || x + dx >= map.width || y + dy >= map.height || seen.has(n) || !isOpen(map.tiles[n])) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return seen;
}

const MAPS: [string, MapFile][] = [
  ...THEMES.map((t) => [t.id, t.map()] as [string, MapFile]),
  ...Array.from({ length: 20 }, (_, i) => [`world seed ${i + 1}`, generateMap(i + 1)] as [string, MapFile]),
];

describe('deploy', () => {
  it.each(MAPS)('%s: five a side on open, dry, prop-free tiles that join up', (_, map) => {
    const units = deploy(map);
    expect(units.map((u) => u.side)).toEqual([...Array(5).fill('player'), ...Array(5).fill('enemy')]);
    expect(units.map((u) => u.name)).toEqual([...ROSTER.player, ...ROSTER.enemy].map((r) => r.name));
    const at = units.map((u) => u.y * map.width + u.x);
    expect(new Set(at).size).toBe(10);
    for (const i of at) {
      const tile = map.tiles[i];
      expect(isOpen(tile)).toBe(true);
      expect(tile.prop).toBeUndefined();
      expect(isLiquid(tile)).toBe(false);
    }
    const joined = walkable(map, at[0]);
    for (const i of at) expect(joined.has(i)).toBe(true);
  });

  // Together: within 8 tiles (cover and rough ground near a generated map's corner can push a unit or two outward).
  it.each(MAPS)('%s: each side starts together, the player at the front, well apart from the enemy', (_, map) => {
    const units = deploy(map);
    const [player, enemy] = [units.slice(0, 5), units.slice(5)];
    const apart = (a: typeof units[0], b: typeof units[0]) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const mean = (side: typeof units) => side.reduce((s, u) => s + u.x + u.y, 0) / 5;
    expect(mean(player)).toBeGreaterThan(mean(enemy));
    expect(Math.min(...player.flatMap((p) => enemy.map((e) => apart(p, e))))).toBeGreaterThanOrEqual(12);
    for (const side of [player, enemy]) expect(Math.max(...side.flatMap((a) => side.map((b) => apart(a, b))))).toBeLessThanOrEqual(8);
  });

  it('depends only on the map', () => {
    expect(deploy(THEMES[0].map())).toEqual(deploy(THEMES[0].map()));
  });
});
