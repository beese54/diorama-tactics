import { describe, expect, it } from 'vitest';
import { generateMap, WORLD_SHAPES, WORLD_SIZE, WORLD_TERRAINS, worldTraits } from './generator';
import { parseMap, serializeMap } from './mapFile';
import { isLiquid } from './surface';
import { IMPASSABLE, TERRAIN } from './terrain';
import { tileAt, type MapFile, type Tile } from './types';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const maps = SEEDS.map((seed) => generateMap(seed));
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const neighbours = (map: MapFile, t: Tile) => EDGES.map(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)).filter((n): n is Tile => !!n);
const walkable = (t: Tile) => TERRAIN[t.terrain].moveCost < IMPASSABLE;

function reachable(map: MapFile): number {
  const start = map.tiles.find(walkable)!;
  const seen = new Set([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbours(map, queue[i])) {
      if (walkable(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size;
}

describe('generateMap', () => {
  it('gives the same map for the same seed, and a different one for another', () => {
    expect(JSON.stringify(generateMap(7))).toBe(JSON.stringify(generateMap(7)));
    expect(JSON.stringify(generateMap(7))).not.toBe(JSON.stringify(generateMap(8)));
    expect(new Set(maps.map((m) => JSON.stringify(m.tiles))).size).toBe(maps.length);
  });

  it.each(SEEDS)('seed %i is a valid 32×32 map of natural terrain', (seed) => {
    const map = maps[seed - 1];
    expect(map).toMatchObject({ version: 1, seed, width: WORLD_SIZE, height: WORLD_SIZE });
    expect(map.tiles).toHaveLength(WORLD_SIZE * WORLD_SIZE);
    for (const t of map.tiles) {
      expect(tileAt(map, t.x, t.y)).toBe(t);
      expect(Number.isInteger(t.height) && t.height >= 0 && t.height <= 8).toBe(true);
      expect(WORLD_TERRAINS).toContain(t.terrain);
      expect(t.moisture >= 0 && t.moisture <= 1).toBe(true);
      // Water and only water is liquid, at the bottom.
      expect(isLiquid(t)).toBe(t.water !== null);
      if (t.water) expect(t.height).toBe(0);
      else expect(t.height).toBeGreaterThanOrEqual(1);
    }
  });

  it('uses every natural terrain somewhere across 50 seeds, and every shape', () => {
    const used = new Set(maps.flatMap((m) => m.tiles.map((t) => t.terrain)));
    expect([...WORLD_TERRAINS].filter((id) => !used.has(id))).toEqual([]);
    expect(new Set(SEEDS.map((s) => worldTraits(s).shape))).toEqual(new Set(WORLD_SHAPES));
  });

  it.each(SEEDS)('seed %i lets a walking unit reach every open tile, and most tiles are open', (seed) => {
    const map = maps[seed - 1];
    const open = map.tiles.filter(walkable).length;
    expect(open / map.tiles.length).toBeGreaterThanOrEqual(0.65);
    expect(reachable(map)).toBe(open);
  });

  it.each(SEEDS)('seed %i slopes its banks down to the water', (seed) => {
    const map = maps[seed - 1];
    for (const t of map.tiles.filter((t) => t.water)) {
      for (const n of neighbours(map, t)) if (!n.water) expect(n.height).toBe(1);
    }
  });

  it.each(SEEDS)('seed %i has no one-tile specks of land cover', (seed) => {
    const map = maps[seed - 1];
    const specks = map.tiles.filter((t) => {
      const land = neighbours(map, t).filter((n) => !n.water);
      return !t.water && land.length > 0 && !land.some((n) => n.terrain === t.terrain);
    });
    expect(specks.map((t) => `${t.x},${t.y} ${t.terrain}`)).toEqual([]);
  });

  it.each(SEEDS)('seed %i has no lone pillars or pits', (seed) => {
    const map = maps[seed - 1];
    for (const t of map.tiles.filter((t) => !t.water)) {
      const heights = neighbours(map, t).map((n) => n.height);
      expect(t.height).toBeLessThanOrEqual(Math.max(...heights) + 1);
      expect(t.height).toBeGreaterThanOrEqual(Math.min(...heights) - 1);
    }
  });

  it('rings islands with sea, keeps valleys inland, and calls water at the edge sea', () => {
    for (const map of maps) {
      const { shape } = worldTraits(map.seed);
      const border = map.tiles.filter((t) => t.x === 0 || t.y === 0 || t.x === WORLD_SIZE - 1 || t.y === WORLD_SIZE - 1);
      const wetBorder = border.filter((t) => t.water).length / border.length;
      if (shape === 'island') expect(wetBorder).toBeGreaterThan(0.6);
      if (shape === 'valley') expect(map.tiles.some((t) => t.water?.kind === 'sea')).toBe(false);
      else expect(border.filter((t) => t.water).every((t) => t.water!.kind === 'sea' || t.water!.kind === 'ford')).toBe(true);
    }
  });

  it('stands tall ground toward the back of the opening view, where it hides nothing', () => {
    const mean = (tiles: Tile[]) => tiles.reduce((s, t) => s + t.height, 0) / tiles.length;
    const all = maps.flatMap((m) => m.tiles);
    const back = all.filter((t) => t.x + t.y < WORLD_SIZE - 1);
    const front = all.filter((t) => t.x + t.y > WORLD_SIZE - 1);
    expect(mean(back)).toBeGreaterThan(mean(front));
  });

  it('round-trips through the JSON file format', () => {
    for (const map of maps.slice(0, 5)) expect(parseMap(serializeMap(map))).toEqual(map);
  });
});
