import { describe, expect, it } from 'vitest';
import { createTestMap } from './testMap';
import { tileAt } from './types';

const isWater = (terrain: string) => terrain === 'deep_water' || terrain === 'shallow_water';

describe('createTestMap', () => {
  const map = createTestMap();

  it('is 32x32 and row-major', () => {
    expect(map.tiles).toHaveLength(32 * 32);
    for (const t of map.tiles) expect(tileAt(map, t.x, t.y)).toBe(t);
  });

  it('shows at least 5 terrain types', () => {
    expect(new Set(map.tiles.map((t) => t.terrain)).size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic for a seed', () => {
    expect(JSON.stringify(createTestMap(7))).toBe(JSON.stringify(createTestMap(7)));
  });

  it('returns undefined outside the grid', () => {
    expect(tileAt(map, -1, 0)).toBeUndefined();
    expect(tileAt(map, 0, 32)).toBeUndefined();
  });

  it('keeps heights in 0..8 with water lowest and land above it', () => {
    for (const t of map.tiles) {
      expect(Number.isInteger(t.height) && t.height >= 0 && t.height <= 8).toBe(true);
      if (isWater(t.terrain)) expect(t.height).toBe(0);
      else expect(t.height).toBeGreaterThanOrEqual(1);
    }
  });

  it('slopes banks: land next to water is exactly one step above it', () => {
    for (const t of map.tiles) {
      if (isWater(t.terrain)) continue;
      const touchesWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const n = tileAt(map, t.x + dx, t.y + dy);
        return n !== undefined && isWater(n.terrain);
      });
      if (touchesWater) expect(t.height).toBe(1);
    }
  });

  it('puts the snowy peak at the top and the mountain above the hills', () => {
    const max = (terrain: string) => Math.max(...map.tiles.filter((t) => t.terrain === terrain).map((t) => t.height));
    const min = (terrain: string) => Math.min(...map.tiles.filter((t) => t.terrain === terrain).map((t) => t.height));
    expect(max('peak_snow')).toBe(8);
    expect(min('mountain')).toBeGreaterThan(max('hills'));
    expect(min('pine_forest')).toBeGreaterThan(max('light_woods'));
  });
});
