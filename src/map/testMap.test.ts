import { describe, expect, it } from 'vitest';
import { createTestMap } from './testMap';
import { tileAt } from './types';

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
});
