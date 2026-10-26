import { describe, expect, it } from 'vitest';
import { generateMap, generateWorld, WORLD_SIZE } from './generator';
import { serializeMap } from './mapFile';
import { tileAt, type MapFile, type Tile } from './types';

/** FNV-1a over a string, as 8 hex digits. */
function fingerprint(text: string, h = 0x811c9dc5): number {
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

describe('bigger boards', () => {
  it('leave the standard 32×32 maps exactly as they were before M9', () => {
    let h = 0x811c9dc5;
    for (let seed = 1; seed <= 60; seed++) h = fingerprint(serializeMap(generateMap(seed)), h);
    expect(h.toString(16).padStart(8, '0')).toBe('8b89b6c7');
  });

  it('leave the 64×64 maps exactly as M9 shipped them', () => {
    let h = 0x811c9dc5;
    for (let seed = 1; seed <= 20; seed++) h = fingerprint(serializeMap(generateMap(seed, 64)), h);
    expect(h.toString(16).padStart(8, '0')).toBe('8ce082c1');
  });

  const SEEDS = Array.from({ length: 16 }, (_, i) => 100 + i);
  const worlds = (size: number) => SEEDS.map((seed) => generateWorld(seed, size));
  const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const riverTiles = ({ map }: ReturnType<typeof generateWorld>) => map.tiles.filter((t) => t.water && (t.water.kind === 'river' || t.water.kind === 'ford' || t.water.kind === 'waterfall')).length;
  const roadShare = ({ map }: ReturnType<typeof generateWorld>) => map.tiles.filter((t) => t.terrain === 'road').length / map.tiles.length;
  const standard = worlds(WORLD_SIZE);
  const big = worlds(64);

  it('keep about the standard density of settlements, rivers and roads at 64×64', () => {
    const perArea = (xs: number[], size: number) => average(xs) / (size * size);
    const ratio = (f: (w: ReturnType<typeof generateWorld>) => number) => perArea(big.map(f), 64) / perArea(standard.map(f), WORLD_SIZE);
    expect(ratio((w) => w.settlements.length)).toBeGreaterThan(0.6);
    expect(ratio(riverTiles)).toBeGreaterThan(0.6);
    expect(average(big.map(roadShare)) / average(standard.map(roadShare))).toBeGreaterThan(0.5);
  });

  it('spread the extra settlements out', () => {
    for (const { map, settlements } of big) {
      const own = settlements.length;
      expect(own).toBeGreaterThanOrEqual(2);
      // Gap between two footprints, in tiles (0 when they touch).
      const gap = (a: (typeof settlements)[0], b: (typeof settlements)[0]) =>
        Math.max(a.x - (b.x + b.size), b.x - (a.x + a.size), a.y - (b.y + b.size), b.y - (a.y + a.size), 0);
      for (const [i, a] of settlements.entries()) for (const b of settlements.slice(i + 1)) expect(gap(a, b), `seed ${map.seed}`).toBeGreaterThanOrEqual(2);
      const farthest = Math.max(...settlements.flatMap((a) => settlements.map((b) => gap(a, b))));
      expect(farthest, `seed ${map.seed}`).toBeGreaterThanOrEqual(12);
    }
  });

  it('link nearly every settlement to the road network', () => {
    const roadBy = (map: MapFile, t: Tile) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(map, t.x + dx, t.y + dy)?.terrain === 'road');
    const all = big.flatMap(({ map, settlements }) => settlements.map((s) => s.gates.some((g) => roadBy(map, g))));
    // A settlement cut off by water, with no straight crossing for a bridge, may stand alone.
    expect(all.filter(Boolean).length / all.length).toBeGreaterThan(0.85);
  });
});
