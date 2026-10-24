import { describe, expect, it } from 'vitest';
import { paintGround } from './ground';
import { isWater } from './surface';
import { createTestMap } from './testMap';
import { TILE_PX } from './textures';
import { TERRAIN_IDS, tileAt } from './types';
import { WATER_FRAMES } from './water';

describe('map-wide ground painting', () => {
  const map = createTestMap();
  const img = paintGround(map);
  const idx = (gx: number, gy: number) => gy * img.width + gx;
  const color = (gx: number, gy: number, frame = 0) => [...img.frames[frame].subarray(idx(gx, gy) * 4, idx(gx, gy) * 4 + 3)];
  const terrainAt = (gx: number, gy: number) => TERRAIN_IDS[img.material[idx(gx, gy)]];
  const watery = (i: number) => TERRAIN_IDS[img.material[i]].endsWith('water');

  it('paints every pixel opaque, in every frame', () => {
    expect(img.frames).toHaveLength(WATER_FRAMES);
    const clear = img.frames.reduce((n, frame) => n + frame.filter((v, i) => i % 4 === 3 && v !== 255).length, 0);
    expect(clear).toBe(0);
  });

  it('is deterministic', () => {
    const again = paintGround(map);
    expect(again.material).toEqual(img.material);
    expect(again.frames[0]).toEqual(img.frames[0]);
  });

  it('keeps each tile its own terrain at its centre, and water exactly on water tiles', () => {
    for (const t of map.tiles) {
      expect(terrainAt(t.x * TILE_PX + 8, t.y * TILE_PX + 8)).toBe(t.terrain);
      for (let py = 0; py < TILE_PX; py++) {
        for (let px = 0; px < TILE_PX; px++) expect(watery(idx(t.x * TILE_PX + px, t.y * TILE_PX + py))).toBe(isWater(t));
      }
    }
  });

  it('frays terrain borders into the neighbouring tile instead of following the grid', () => {
    // Along each vertical border between two different land terrains, find where the terrain
    // switches in every pixel row; a ragged border switches at many different columns.
    let borders = 0;
    let ragged = 0;
    for (const t of map.tiles) {
      const nb = tileAt(map, t.x + 1, t.y);
      if (!nb || isWater(t) || isWater(nb) || nb.terrain === t.terrain || Math.abs(nb.height - t.height) > 1) continue;
      borders++;
      const crossings = new Set<number>();
      for (let py = 0; py < TILE_PX; py++) {
        const gy = t.y * TILE_PX + py;
        for (let px = -6; px < 6; px++) {
          const gx = (t.x + 1) * TILE_PX + px;
          if (terrainAt(gx, gy) !== terrainAt(gx + 1, gy)) crossings.add(px);
        }
      }
      if (crossings.size >= 4) ragged++;
    }
    expect(borders).toBeGreaterThan(10);
    expect(ragged / borders).toBeGreaterThan(0.8);
  });

  it('has no seam between tiles of the same terrain', () => {
    // Colour change across a tile border should be no bigger than inside a tile.
    const diff = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    let across = 0;
    let inside = 0;
    for (const t of map.tiles.filter((t) => t.terrain === 'plains')) {
      if (tileAt(map, t.x + 1, t.y)?.terrain !== 'plains') continue;
      for (let py = 0; py < TILE_PX; py++) {
        const gy = t.y * TILE_PX + py;
        across += diff(color((t.x + 1) * TILE_PX - 1, gy), color((t.x + 1) * TILE_PX, gy));
        inside += diff(color(t.x * TILE_PX + 7, gy), color(t.x * TILE_PX + 8, gy));
      }
    }
    expect(across).toBeLessThan(inside * 1.3);
  });

  it('shades a terrain in patches, not one look per tile', () => {
    const brightness = (x: number, y: number) => {
      let sum = 0;
      for (let py = 0; py < TILE_PX; py++) {
        for (let px = 0; px < TILE_PX; px++) sum += color(x * TILE_PX + px, y * TILE_PX + py).reduce((a, b) => a + b);
      }
      return sum / (TILE_PX * TILE_PX);
    };
    const values = map.tiles.filter((t) => t.terrain === 'plains').map((t) => brightness(t.x, t.y));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(15);
  });

  it('animates only the water', () => {
    const [a, b] = [img.frames[0], img.frames[3]];
    let landChanged = 0;
    let waterChanged = 0;
    for (let i = 0; i < img.material.length; i++) {
      if (a[i * 4] === b[i * 4] && a[i * 4 + 1] === b[i * 4 + 1] && a[i * 4 + 2] === b[i * 4 + 2]) continue;
      if (watery(i)) waterChanged++;
      else landChanged++;
    }
    expect(landChanged).toBe(0);
    expect(waterChanged).toBeGreaterThan(100);
  });
});
