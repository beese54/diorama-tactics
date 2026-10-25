import { describe, expect, it } from 'vitest';
import { generateWorld, WORLD_SIZE } from './generator';
import { inside, settlementKinds, SETTLEMENT_KINDS } from './settlements';
import { isLiquid } from './surface';
import { bridgeOf, IMPASSABLE, TERRAIN, tileStats } from './terrain';
import { tileAt, type MapFile, type Tile } from './types';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const worlds = SEEDS.map((seed) => generateWorld(seed));
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const AROUND = [...EDGES, [1, 1], [1, -1], [-1, 1], [-1, -1]];
const built = (t: Tile) => TERRAIN[t.terrain].shape === 'built';

/** Tiles reachable along roads (and the bridges and gates they use) from `start`. */
function roadNetwork(map: MapFile, start: readonly Tile[]): Set<Tile> {
  const seen = new Set(start);
  const queue = [...start];
  for (let k = 0; k < queue.length; k++) {
    for (const [dx, dy] of EDGES) {
      const n = tileAt(map, queue[k].x + dx, queue[k].y + dy);
      if (!n || seen.has(n)) continue;
      if (n.terrain === 'road' || (isLiquid(n) && bridgeOf(n))) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

describe('settlements on generated maps', () => {
  it('gives every map a settlement, and builds the kind the seed asked for wherever it fits', () => {
    for (const { settlements } of worlds) expect(settlements.length).toBeGreaterThanOrEqual(1);
    const honoured = worlds.filter(({ map, settlements }) => settlements[0].kind === settlementKinds(map.seed)[0]).length;
    expect(honoured).toBeGreaterThanOrEqual(45);
    expect(new Set(worlds.map(({ settlements }) => settlements[0].kind))).toEqual(new Set(SETTLEMENT_KINDS));
  });

  it.each(SEEDS)('seed %i builds on level, dry ground: streets at one height, buildings above them', (seed) => {
    const { map, settlements } = worlds[seed - 1];
    for (const s of settlements) {
      const tiles = map.tiles.filter((t) => inside(s, t));
      expect(tiles).toHaveLength(s.size * s.size);
      for (const t of tiles) {
        expect(isLiquid(t)).toBe(false);
        if (built(t) && t.terrain !== 'flagstone') expect(t.height, `${s.kind} ${t.x},${t.y}`).toBeGreaterThan(s.ground);
        else expect(t.height, `${s.kind} ${t.x},${t.y}`).toBe(s.ground);
      }
      // No water beside the footprint either.
      for (const t of tiles) for (const [dx, dy] of AROUND) expect(tileAt(map, t.x + dx, t.y + dy)?.water ?? null).toBeNull();
    }
  });

  it('lets units stand on every rooftop and rampart', () => {
    for (const { map } of worlds) {
      for (const t of map.tiles.filter((t) => ['house_thatch', 'house_tile', 'rampart', 'ruined_wall'].includes(t.terrain))) {
        expect(tileStats(t).moveCost).toBeLessThan(IMPASSABLE);
      }
    }
  });

  it.each(SEEDS)('seed %i links its settlements by road, and runs roads out to the board edges, crossing water only on bridges', (seed) => {
    const { map, settlements } = worlds[seed - 1];
    const [main, ...others] = settlements;
    const network = roadNetwork(map, main.gates);
    const onEdge = [...network].filter((t) => t.x === 0 || t.y === 0 || t.x === WORLD_SIZE - 1 || t.y === WORLD_SIZE - 1 && !isLiquid(t));
    expect(onEdge.length, 'a road reaches the edge').toBeGreaterThanOrEqual(1);
    for (const other of others) expect(other.gates.some((g) => network.has(g)), `${other.kind} linked to ${main.kind}`).toBe(true);
    // Roads never run through water: every road tile is dry land.
    for (const t of map.tiles.filter((t) => t.terrain === 'road')) expect(isLiquid(t)).toBe(false);
  });

  it('keeps cover off roads and settlements', () => {
    for (const { map, settlements } of worlds) {
      for (const t of map.tiles.filter((t) => t.prop && ['broadleaf', 'pine', 'pine_snowy', 'boulder', 'snag'].includes(t.prop))) {
        expect(t.terrain).not.toBe('road');
        expect(settlements.some((s) => inside(s, t))).toBe(false);
      }
    }
  });

  it('stands castles toward the back of the opening view, where their walls hide the least', () => {
    const castles = worlds.flatMap(({ settlements }) => settlements.filter((s) => s.kind === 'castle'));
    expect(castles.length).toBeGreaterThan(5);
    const depth = castles.reduce((sum, s) => sum + s.x + s.y + s.size - 1, 0) / castles.length;
    expect(depth).toBeLessThan(WORLD_SIZE - 1);
  });
});
