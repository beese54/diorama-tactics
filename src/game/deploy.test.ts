import { describe, expect, it } from 'vitest';
import { generateMap } from '../map/generator';
import { isLiquid } from '../map/surface';
import type { MapFile } from '../map/types';
import { THEMES } from '../themes';
import { deploy, ROSTER, START_GAP, START_REACH } from './deploy';
import { isOpen } from './movement';

const EDGES = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** Tile indices reachable on foot from `start`, ignoring units, and how many steps' walk each is. */
function walkSteps(map: MapFile, start: number): Map<number, number> {
  const steps = new Map([[start, 0]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = [queue[i] % map.width, Math.floor(queue[i] / map.width)];
    for (const [dx, dy] of EDGES) {
      const n = (y + dy) * map.width + x + dx;
      if (x + dx < 0 || y + dy < 0 || x + dx >= map.width || y + dy >= map.height || steps.has(n) || !isOpen(map.tiles[n])) continue;
      steps.set(n, steps.get(queue[i])! + 1);
      queue.push(n);
    }
  }
  return steps;
}
const walkable = (map: MapFile, start: number) => new Set(walkSteps(map, start).keys());

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
  it.each(MAPS)('%s: each side starts together, the player at the front, a short march from the enemy', (_, map) => {
    const units = deploy(map);
    const [player, enemy] = [units.slice(0, 5), units.slice(5)];
    const apart = (a: typeof units[0], b: typeof units[0]) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const mean = (side: typeof units) => side.reduce((s, u) => s + u.x + u.y, 0) / 5;
    expect(mean(player)).toBeGreaterThan(mean(enemy));
    for (const side of [player, enemy]) expect(Math.max(...side.flatMap((a) => side.map((b) => apart(a, b))))).toBeLessThanOrEqual(8);
    // Every unit has a foe within START_REACH tiles' walk, and no foe stands closer than START_GAP.
    const at = (u: typeof units[0]) => u.y * map.width + u.x;
    const nearest = units.map((u) => {
      const steps = walkSteps(map, at(u));
      return Math.min(...units.filter((f) => f.side !== u.side).map((f) => steps.get(at(f)) ?? Infinity));
    });
    expect(Math.max(...nearest)).toBeLessThanOrEqual(START_REACH);
    expect(Math.min(...nearest)).toBeGreaterThanOrEqual(START_GAP);
  });

  it('depends only on the map', () => {
    expect(deploy(THEMES[0].map())).toEqual(deploy(THEMES[0].map()));
  });
});
