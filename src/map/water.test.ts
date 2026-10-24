import { describe, expect, it } from 'vitest';
import { createTestMap } from './testMap';
import { isWater } from './surface';
import { paintWater, WATER_RAMP } from './water';

const PX = 16;

describe('map-wide water painting', () => {
  const map = createTestMap();
  const img = paintWater(map, PX);
  const at = (gx: number, gy: number) => img.index[gy * img.width + gx];

  it('paints exactly the water tiles', () => {
    for (const t of map.tiles) {
      const c = at(t.x * PX + 8, t.y * PX + 8);
      expect(c >= 0).toBe(isWater(t));
    }
  });

  it('is deterministic', () => {
    expect(paintWater(map, PX).index).toEqual(img.index);
  });

  it('gives a single water tile several shades, so contours cross tile borders', () => {
    let mixed = 0;
    for (const t of map.tiles.filter(isWater)) {
      const shades = new Set<number>();
      for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) shades.add(at(t.x * PX + px, t.y * PX + py));
      if ([...shades].filter((c) => c < WATER_RAMP.length).length >= 2) mixed++;
    }
    expect(mixed / map.tiles.filter(isWater).length).toBeGreaterThan(0.5);
  });

  it('is shallow (light) at the shore and deeper away from it', () => {
    let shore = 0;
    let shoreN = 0;
    let open = 0;
    let openN = 0;
    for (const t of map.tiles.filter(isWater)) {
      const landSide = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const n = map.tiles.find((o) => o.x === t.x + dx && o.y === t.y + dy);
        return n && !isWater(n);
      });
      for (let p = 0; p < PX; p += 2) {
        const c = at(t.x * PX + p, t.y * PX + 8);
        if (c >= WATER_RAMP.length) continue; // glint
        if (landSide) (shore += c), shoreN++;
        else (open += c), openN++;
      }
    }
    expect(shore / shoreN).toBeLessThan(open / openN - 1);
  });
});
