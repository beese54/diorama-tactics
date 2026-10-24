import { describe, expect, it } from 'vitest';
import { IMPASSABLE, TERRAIN } from './terrain';
import { TERRAIN_IDS } from './types';

describe('TERRAIN table', () => {
  it('has exactly one entry per TerrainId', () => {
    expect(Object.keys(TERRAIN).sort()).toEqual([...TERRAIN_IDS].sort());
  });

  it.each(TERRAIN_IDS)('%s is well formed', (id) => {
    const def = TERRAIN[id];
    expect(def.name.length).toBeGreaterThan(0);
    expect(Number.isInteger(def.moveCost)).toBe(true);
    expect(def.moveCost >= 1 && (def.moveCost <= 5 || def.moveCost === IMPASSABLE)).toBe(true);
    expect(Number.isInteger(def.defense)).toBe(true);
    expect(def.palette.length).toBeGreaterThanOrEqual(3);
    for (const c of def.palette) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
