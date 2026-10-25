import { describe, expect, it } from 'vitest';
import { COVER_SHARE } from './cover';
import { generateMap, WORLD_SIZE } from './generator';
import { PROPS } from './props';
import { isLiquid } from './surface';
import { tileAt, type MapFile, type PropId, type TerrainId, type Tile } from './types';

const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const maps = SEEDS.map((seed) => generateMap(seed));
const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const around = (map: MapFile, t: Tile) => AROUND.map(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)).filter((n): n is Tile => !!n);

/** Which ground each kind of cover may stand on. */
const BELONGS: Record<string, readonly TerrainId[]> = {
  broadleaf: ['light_woods', 'forest'],
  pine: ['pine_forest'],
  pine_snowy: ['pine_forest', 'snowfield'],
  boulder: ['hills', 'scree', 'mountain', 'badlands'],
  snag: ['swamp', 'bog'],
};

describe('cover on generated maps', () => {
  it.each(SEEDS)('seed %i puts each kind of cover only on the ground it grows on', (seed) => {
    for (const t of maps[seed - 1].tiles.filter((t) => t.prop)) expect(BELONGS[t.prop!], `${t.prop} on ${t.terrain}`).toContain(t.terrain);
  });

  it.each(SEEDS)('seed %i keeps cover sparse: at most an eighth of the land, and over 80% of open tiles clear', (seed) => {
    const land = maps[seed - 1].tiles.filter((t) => !isLiquid(t));
    const covered = land.filter((t) => t.prop).length;
    expect(covered).toBeLessThanOrEqual(Math.floor(land.length * COVER_SHARE));
    expect(1 - covered / land.length).toBeGreaterThan(0.8);
  });

  it.each(SEEDS)('seed %i keeps water, bridges and their neighbours, and river banks clear', (seed) => {
    const map = maps[seed - 1];
    for (const t of map.tiles.filter((t) => t.prop)) {
      expect(isLiquid(t) || !!t.feature).toBe(false);
      const near = around(map, t);
      expect(near.some((n) => n.feature), `${t.x},${t.y} beside a bridge`).toBe(false);
      expect(near.some((n) => n.water?.kind === 'river' || n.water?.kind === 'waterfall'), `${t.x},${t.y} on a river bank`).toBe(false);
    }
  });

  it.each(SEEDS)('seed %i puts snow on pines only at the snowline, and none on a map without snow', (seed) => {
    const map = maps[seed - 1];
    const snowy = (t: Tile) => t.terrain === 'snowfield' || t.terrain === 'peak_snow';
    for (const t of map.tiles.filter((t) => t.prop === 'pine_snowy')) {
      let near = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near ||= !!tileAt(map, t.x + dx, t.y + dy) && snowy(tileAt(map, t.x + dx, t.y + dy)!);
      expect(near, `snowy pine at ${t.x},${t.y} on ${t.terrain}, far from any snow`).toBe(true);
    }
    if (!map.tiles.some(snowy)) expect(map.tiles.some((t) => t.prop === 'pine_snowy')).toBe(false);
  });

  it('never blocks a tile, so units can still stand anywhere they could before', () => {
    for (const map of maps) for (const t of map.tiles.filter((t) => t.prop)) expect(PROPS[t.prop!].blocks).toBe(false);
  });

  it('grows every kind of cover somewhere, and gives every map some', () => {
    const kinds = new Set<PropId>(maps.flatMap((m) => m.tiles.filter((t) => t.prop).map((t) => t.prop!)));
    expect([...kinds].sort()).toEqual(['boulder', 'broadleaf', 'pine', 'pine_snowy', 'snag']);
    for (const map of maps) expect(map.tiles.filter((t) => t.prop).length).toBeGreaterThanOrEqual(15);
  });

  it('is thinner on the front rows, where it would hide the board behind it', () => {
    const share = (front: boolean) => {
      const tiles = maps.flatMap((m) => m.tiles.filter((t) => !isLiquid(t) && (Math.min(WORLD_SIZE - 1 - t.x, WORLD_SIZE - 1 - t.y) < 3) === front));
      return tiles.filter((t) => t.prop).length / tiles.length;
    };
    expect(share(true)).toBeLessThan(share(false) * 0.6);
  });

  it('grows trees in clumps rather than one by one', () => {
    // A tree has another tree beside it far more often than chance would give.
    let trees = 0;
    let neighboured = 0;
    let treeShare = 0;
    for (const map of maps) {
      const isTree = (t: Tile) => t.prop === 'broadleaf' || t.prop === 'pine' || t.prop === 'pine_snowy';
      const all = map.tiles.filter(isTree);
      trees += all.length;
      neighboured += all.filter((t) => around(map, t).some(isTree)).length;
      treeShare += all.length / map.tiles.length / maps.length;
    }
    expect(neighboured / trees).toBeGreaterThan(Math.min(0.9, 8 * treeShare * 3));
  });
});
