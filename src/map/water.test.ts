import { describe, expect, it } from 'vitest';
import { createTestMap } from './testMap';
import { isWater } from './surface';
import { paintWater, WATER_FRAMES, WATER_RAMP } from './water';

const PX = 16;

describe('map-wide water painting', () => {
  const map = createTestMap();
  const img = paintWater(map, PX);
  const at = (gx: number, gy: number, frame = 0) => img.frames[frame][gy * img.width + gx];

  it('paints exactly the water tiles, in every frame', () => {
    for (let f = 0; f < WATER_FRAMES; f++) {
      for (const t of map.tiles) {
        for (const [px, py] of [[0, 0], [8, 8], [15, 15]]) expect(at(t.x * PX + px, t.y * PX + py, f) >= 0).toBe(isWater(t));
      }
    }
  });

  it('is deterministic', () => {
    expect(paintWater(map, PX).frames).toEqual(img.frames);
  });

  it('moves a little every frame, and the loop closes without a jump', () => {
    const changed = (a: Int8Array, b: Int8Array) => {
      let n = 0;
      let water = 0;
      a.forEach((c, i) => {
        if (c < 0) return;
        water++;
        if (c !== b[i]) n++;
      });
      return n / water;
    };
    expect(img.frames).toHaveLength(WATER_FRAMES);
    for (let f = 0; f < WATER_FRAMES; f++) {
      // The last frame -> first frame step is like any other, so the loop has no visible jump.
      const step = changed(img.frames[f], img.frames[(f + 1) % WATER_FRAMES]);
      expect(step).toBeGreaterThan(0.02);
      expect(step).toBeLessThan(0.35);
    }
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
