import { describe, expect, it } from 'vitest';
import { createTestMap } from './testMap';
import { BALANCE_SHIFT, isFlat, isLiquid, RIM_DROP, RIM_WIDTH_MAX, RIM_WIDTH_MIN, SAMPLES, shapeAt, STEP_HEIGHT, surfaceAt } from './surface';
import { tileAt, type MapFile, type Tile } from './types';

/** A small map from a height grid (rows = y), all plains unless listed as water. */
function gridMap(heights: number[][], water: [number, number][] = []): MapFile {
  const tiles: Tile[] = [];
  heights.forEach((row, y) =>
    row.forEach((height, x) => {
      const wet = water.some(([wx, wy]) => wx === x && wy === y);
      tiles.push({ x, y, height, terrain: wet ? 'shallow_water' : 'plains', moisture: 0.5, water: null, feature: null, seedRand: 0 });
    }),
  );
  return { version: 1, seed: 0, width: heights[0].length, height: heights.length, tiles };
}

/** World y of a tile's surface at local (u, v). */
const y = (map: MapFile, t: Tile, u: number, v: number) => t.height * STEP_HEIGHT + surfaceAt(map, t, u, v).offset;

/** Every shared edge between east/south neighbours, sampled at the mesh's sample points. */
function* sharedEdges(map: MapFile) {
  for (const t of map.tiles) {
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const nb = tileAt(map, t.x + dx, t.y + dy);
      if (!nb) continue;
      for (const s of SAMPLES) {
        const [u, v] = dx ? [1, s] : [s, 1];
        yield { t, nb, a: y(map, t, u, v), b: y(map, nb, u - dx, v - dy) };
      }
    }
  }
}

describe('rounded surface', () => {
  const plateau = gridMap([
    [1, 1, 1, 1, 1],
    [1, 3, 3, 3, 1],
    [1, 3, 3, 3, 1],
    [1, 3, 3, 3, 1],
    [1, 1, 1, 1, 1],
  ]);
  const centre = tileAt(plateau, 2, 2)!;
  const rim = tileAt(plateau, 1, 2)!; // west edge of the plateau
  const foot = tileAt(plateau, 0, 2)!; // ground west of the plateau

  it('leaves tiles surrounded by equal heights flat', () => {
    expect(isFlat(plateau, centre)).toBe(true);
    for (const s of SAMPLES) expect(surfaceAt(plateau, centre, s, s).offset).toBe(0);
  });

  it('curves a lip down over a drop and eases back to flat within the rim width', () => {
    const lip = -surfaceAt(plateau, rim, 0, 0.5).offset;
    expect(lip).toBeGreaterThanOrEqual(RIM_DROP * (1 - BALANCE_SHIFT) - 1e-9);
    expect(lip).toBeLessThanOrEqual(RIM_DROP * (1 + BALANCE_SHIFT) + 1e-9);
    expect(surfaceAt(plateau, rim, RIM_WIDTH_MAX, 0.5).offset).toBe(0);
    let prev = -Infinity;
    for (let u = 0; u <= RIM_WIDTH_MAX; u += 1 / 64) {
      const o = surfaceAt(plateau, rim, u, 0.5).offset;
      expect(o).toBeGreaterThanOrEqual(prev);
      prev = o;
    }
  });

  it('curves the ground up into the foot of a rise', () => {
    const s = surfaceAt(plateau, foot, 1, 0.5);
    expect(s.offset).toBeCloseTo(shapeAt(plateau.seed, foot.x + 1, foot.y + 0.5).footRise);
    expect(s.foot).toBeCloseTo(1);
    expect(surfaceAt(plateau, foot, 1 - RIM_WIDTH_MAX, 0.5).offset).toBe(0);
  });

  it('rounds a convex plateau corner more than a mitre would', () => {
    const corner = tileAt(plateau, 1, 1)!;
    const d = 0.1;
    // A mitred corner would sit at the profile of min(d, d) = d; rounding lowers it further.
    expect(surfaceAt(plateau, corner, d, d).offset).toBeLessThan(surfaceAt(plateau, corner, d, 0.5).offset);
  });

  it('keeps water flat', () => {
    const map = gridMap([[0, 2], [0, 2]], [[0, 0], [0, 1]]);
    const w = tileAt(map, 0, 0)!;
    expect(isLiquid(w)).toBe(true);
    for (const s of SAMPLES) expect(surfaceAt(map, w, 1, s).offset).toBe(0);
  });

  it.each([
    ['test map', createTestMap()],
    ['plateau', plateau],
    ['stairs and pits', gridMap([[0, 1, 2, 3], [1, 4, 2, 1], [2, 2, 0, 3], [3, 1, 3, 5]])],
  ])('has no cracks between equal-height neighbours (%s)', (_, map) => {
    for (const e of sharedEdges(map)) {
      if (e.t.height === e.nb.height && isLiquid(e.t) === isLiquid(e.nb)) expect(e.a).toBeCloseTo(e.b, 9);
    }
  });

  it.each([
    ['test map', createTestMap()],
    ['stairs and pits', gridMap([[0, 1, 2, 3], [1, 4, 2, 1], [2, 2, 0, 3], [3, 1, 3, 5]])],
  ])('never lets a lower tile poke above a higher one at their edge (%s)', (_, map) => {
    for (const e of sharedEdges(map)) {
      if (e.t.height > e.nb.height) expect(e.a).toBeGreaterThanOrEqual(e.b - 1e-9);
      if (e.nb.height > e.t.height) expect(e.b).toBeGreaterThanOrEqual(e.a - 1e-9);
    }
  });

  it('slopes a bank right down to the waterline of lower water', () => {
    const map = gridMap([[0, 1, 1], [0, 1, 1], [0, 1, 1]], [[0, 0], [0, 1], [0, 2]]);
    const bank = tileAt(map, 1, 1)!;
    for (const s of SAMPLES) expect(y(map, bank, 0, s)).toBeCloseTo(0, 9);
    expect(surfaceAt(map, bank, RIM_WIDTH_MAX, 0.5).offset).toBe(0);
  });

  it('varies the rounding smoothly across the map, within bounds', () => {
    const widths = new Set<number>();
    for (let x = 0; x < 32; x += 0.25) {
      const a = shapeAt(7, x, 3.3);
      const b = shapeAt(7, x + 0.01, 3.3);
      expect(a.width).toBeGreaterThanOrEqual(RIM_WIDTH_MIN);
      expect(a.width).toBeLessThan(RIM_WIDTH_MAX);
      expect(a.lipDrop + a.footRise).toBeCloseTo(STEP_HEIGHT, 12);
      expect(Math.abs(a.width - b.width)).toBeLessThan(0.02); // smooth, never a per-tile jump
      widths.add(Math.round(a.width * 20));
    }
    expect(widths.size).toBeGreaterThanOrEqual(3); // genuinely varied
  });

  it('turns a one-step change between land tiles into one seamless slope', () => {
    // Middle row, away from the map edge (which counts as a drop).
    const map = gridMap([[2, 2, 3, 3], [2, 2, 3, 3], [2, 2, 3, 3]]);
    for (const s of SAMPLES) expect(y(map, tileAt(map, 1, 1)!, 1, s)).toBeCloseTo(y(map, tileAt(map, 2, 1)!, 0, s), 9);
  });
});

describe('built ground', () => {
  /** A 3x3 of paving at height 1 with a wall (height 4) on its north edge and grass at height 1 to the south. */
  const map: MapFile = {
    version: 1, seed: 0, width: 3, height: 3,
    tiles: [
      ...[0, 1, 2].map((x): Tile => ({ x, y: 0, height: 4, terrain: 'castle_wall', moisture: 0.5, water: null, feature: null, seedRand: 0 })),
      ...[0, 1, 2].map((x): Tile => ({ x, y: 1, height: 1, terrain: 'flagstone', moisture: 0.5, water: null, feature: null, seedRand: 0 })),
      ...[0, 1, 2].map((x): Tile => ({ x, y: 2, height: 1, terrain: 'plains', moisture: 0.5, water: null, feature: null, seedRand: 0 })),
    ],
  };

  it('stays flat with sharp edges', () => {
    for (const t of map.tiles.filter((t) => t.terrain !== 'plains')) {
      expect(isFlat(map, t)).toBe(true);
      for (const s of SAMPLES) for (const r of SAMPLES) expect(surfaceAt(map, t, s, r).offset).toBe(0);
    }
  });

  it('does not make natural ground curve up into a wall', () => {
    const wallMap: MapFile = { ...map, tiles: map.tiles.map((t) => (t.y === 1 ? { ...t, terrain: 'plains' } : t)) };
    const grass = tileAt(wallMap, 1, 1)!;
    expect(surfaceAt(wallMap, grass, 0.5, 0).offset).toBe(0);
    expect(surfaceAt(wallMap, grass, 0.5, 0).foot).toBe(0);
  });
});
