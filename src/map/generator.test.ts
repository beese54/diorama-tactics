import { describe, expect, it } from 'vitest';
import { generateMap, SETTLED_TERRAINS, WORLD_SHAPES, WORLD_SIZE, WORLD_TERRAINS, worldTraits } from './generator';
import { MAX_HEIGHT } from './mapFile';
import { parseMap, serializeMap } from './mapFile';
import { isLiquid } from './surface';
import { IMPASSABLE, TERRAIN, tileStats } from './terrain';
import { tileAt, type MapFile, type Tile } from './types';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const maps = SEEDS.map((seed) => generateMap(seed));
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND = [...EDGES, [1, 1], [1, -1], [-1, 1], [-1, -1]];
const isRiver = (t: Tile | undefined) => t?.water?.kind === 'river' || t?.water?.kind === 'waterfall';
const neighbours = (map: MapFile, t: Tile) => EDGES.map(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)).filter((n): n is Tile => !!n);
const walkable = (t: Tile) => tileStats(t).moveCost < IMPASSABLE;

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
      expect(Number.isInteger(t.height) && t.height >= 0 && t.height <= MAX_HEIGHT).toBe(true);
      expect([...WORLD_TERRAINS, ...SETTLED_TERRAINS]).toContain(t.terrain);
      expect(t.moisture >= 0 && t.moisture <= 1).toBe(true);
      // Water and only water is liquid; lakes and sea lie at the bottom, rivers run higher up.
      expect(isLiquid(t)).toBe(t.water !== null);
      if (t.water?.kind === 'lake' || t.water?.kind === 'sea') expect(t.height).toBe(0);
      if (!t.water) expect(t.height).toBeGreaterThanOrEqual(1);
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

  it.each(SEEDS)('seed %i stands every bank one step above the highest water it touches', (seed) => {
    const map = maps[seed - 1];
    for (const t of map.tiles.filter((t) => !t.water)) {
      const wet = AROUND.map(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)).filter((n) => n?.water);
      if (wet.length) expect(t.height, `${t.x},${t.y}`).toBe(Math.max(...wet.map((n) => n!.height)) + 1);
    }
  });

  it.each(SEEDS)('seed %i has no one-tile specks of land cover', (seed) => {
    const map = maps[seed - 1];
    // Settlements and roads are laid out on purpose: a lone house or a one-tile road is no speck.
    const natural = (t: Tile) => !t.water && !SETTLED_TERRAINS.includes(t.terrain);
    const specks = map.tiles.filter(natural).filter((t) => {
      const land = neighbours(map, t).filter(natural);
      return !t.water && land.length > 0 && !land.some((n) => n.terrain === t.terrain);
    });
    expect(specks.map((t) => `${t.x},${t.y} ${t.terrain}`)).toEqual([]);
  });

  it.each(SEEDS)('seed %i has no lone pillars or pits', (seed) => {
    const map = maps[seed - 1];
    // Houses, ramparts and ruined walls stand tall on purpose.
    for (const t of map.tiles.filter((t) => !t.water && TERRAIN[t.terrain].shape !== 'built')) {
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
      else expect(border.filter((t) => t.water && !isRiver(t)).every((t) => t.water!.kind === 'sea' || t.water!.kind === 'ford')).toBe(true);
    }
  });

  it('stands tall ground toward the back of the opening view, where it hides nothing', () => {
    const mean = (tiles: Tile[]) => tiles.reduce((s, t) => s + t.height, 0) / tiles.length;
    const all = maps.flatMap((m) => m.tiles);
    const back = all.filter((t) => t.x + t.y < WORLD_SIZE - 1);
    const front = all.filter((t) => t.x + t.y > WORLD_SIZE - 1);
    expect(mean(back)).toBeGreaterThan(mean(front));
  });

  it.each(SEEDS)('seed %i runs its rivers downhill, from tile to tile, into water or off the front edge', (seed) => {
    const map = maps[seed - 1];
    const rivers = map.tiles.filter(isRiver);
    expect(rivers.length).toBeGreaterThanOrEqual(10);
    for (const t of rivers) {
      const [dx, dy] = t.water!.flow;
      expect(Math.abs(dx) + Math.abs(dy), `${t.x},${t.y}`).toBe(1);
      const to = tileAt(map, t.x + dx, t.y + dy);
      if (!to) {
        // Off the board: only over the front edges, as a fall down the diorama's side.
        expect(t.x === WORLD_SIZE - 1 || t.y === WORLD_SIZE - 1).toBe(true);
        expect(t.water!.kind).toBe('waterfall');
        continue;
      }
      expect(to.water, `${t.x},${t.y} flows onto land`).not.toBeNull();
      expect(to.height).toBeLessThanOrEqual(t.height);
      // A waterfall exactly where the river drops.
      expect(t.water!.kind).toBe(to.height < t.height ? 'waterfall' : 'river');
    }
  });

  it.each(SEEDS)('seed %i keeps its rivers shallow, so units can wade across anywhere', (seed) => {
    for (const t of maps[seed - 1].tiles.filter(isRiver)) expect(t.terrain).toBe('shallow_water');
  });

  it('gives some maps one river and some two, with waterfalls and a bridge on most', () => {
    const springs = (map: MapFile) => map.tiles.filter((t) => isRiver(t) && !neighbours(map, t).some((n) => isRiver(n) && n.x + n.water!.flow[0] === t.x && n.y + n.water!.flow[1] === t.y)).length;
    const counts = maps.map(springs);
    expect(new Set(counts)).toEqual(new Set([1, 2]));
    expect(maps.every((m) => m.tiles.some((t) => t.water?.kind === 'waterfall'))).toBe(true);
    expect(maps.filter((m) => m.tiles.some((t) => t.feature)).length).toBeGreaterThanOrEqual(45);
  });

  it.each(SEEDS)('seed %i bridges a straight stretch of river between two walkable banks', (seed) => {
    const map = maps[seed - 1];
    for (const t of map.tiles.filter((t) => t.feature)) {
      expect(['bridge_wood', 'bridge_stone']).toContain(t.feature);
      expect(t.water?.kind).toBe('river');
      const [dx, dy] = t.water!.flow;
      for (const end of [tileAt(map, t.x + dy, t.y + dx), tileAt(map, t.x - dy, t.y - dx)]) {
        expect(end && walkable(end) && !end.water && end.height === t.height + 1, `${t.x},${t.y}`).toBe(true);
      }
    }
  });

  it('round-trips through the JSON file format', () => {
    for (const map of maps.slice(0, 5)) expect(parseMap(serializeMap(map))).toEqual(map);
  });
});
