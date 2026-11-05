import { describe, expect, it } from 'vitest';
import { frameAt, nearest, quadUV, sheetPixel } from './unitPick';

describe('quadUV', () => {
  // An upright quad 2 wide, 3 high, standing at (10, 10) on a screen where right is +x and up is +y.
  const at = (x: number, y: number) => quadUV([x, y], [10, 10], [1, 0], [0, 1], 2, 3);

  it('finds the point inside the quad, v = 0 at the feet', () => {
    expect(at(10, 10)).toEqual({ u: 0.5, v: 0 });
    expect(at(9.5, 11.5)).toEqual({ u: 0.25, v: 0.5 });
  });

  it('misses outside the quad', () => {
    expect(at(8.9, 11)).toBeNull();
    expect(at(11.1, 11)).toBeNull();
    expect(at(10, 9.9)).toBeNull();
    expect(at(10, 13.1)).toBeNull();
  });

  it('follows a slanted screen mapping (a turned or tilted camera)', () => {
    // right goes (0.6, 0.2) per unit, up goes (-0.1, 0.9): a point built from u, v maps back to them.
    const [right, up] = [[0.6, 0.2], [-0.1, 0.9]] as const;
    const [x, y] = [0.3 * 2 - 1, 0.7 * 3]; // u 0.3, v 0.7 in quad units
    const p = [5 + right[0] * x + up[0] * y, 5 + right[1] * x + up[1] * y] as const;
    const uv = quadUV(p, [5, 5], right, up, 2, 3)!;
    expect(uv.u).toBeCloseTo(0.3, 9);
    expect(uv.v).toBeCloseTo(0.7, 9);
  });

  it('refuses a degenerate mapping', () => {
    expect(quadUV([0, 0], [0, 0], [1, 0], [2, 0], 1, 1)).toBeNull();
  });
});

describe('sheetPixel and frameAt', () => {
  // A 20x26 cell at the sheet's top left of a 256x512 sheet, 2 frames 21 px apart.
  const cell = { u0: 0, u1: 20 / 256, v0: 1 - 26 / 512, v1: 1, frames: 2, fps: 2, stride: 21 / 256 };

  it('maps the cell corners to its pixels', () => {
    expect(sheetPixel(cell, 256, 512, 0, 0.999, 0, false)).toEqual([0, 0]);
    expect(sheetPixel(cell, 256, 512, 0.999, 0, 0, false)).toEqual([19, 25]);
  });

  it('mirrors left for right', () => {
    expect(sheetPixel(cell, 256, 512, 0.01, 0.5, 0, true)[0]).toBe(19);
  });

  it('steps along to the frame', () => {
    expect(sheetPixel(cell, 256, 512, 0, 0.5, 1, false)[0]).toBe(21);
  });

  it('plays frames as the shader does', () => {
    expect(frameAt(cell, 0, 0)).toBe(0);
    expect(frameAt(cell, 0.5, 0)).toBe(1);
    expect(frameAt(cell, 1, 0)).toBe(0);
    expect(frameAt(cell, 0, 0.5)).toBe(1);
    expect(frameAt({ u0: 0, u1: 1, v0: 0, v1: 1 }, 5, 0.3)).toBe(0);
  });
});

describe('nearest', () => {
  it('takes the hit nearest the camera', () => {
    expect(nearest([{ item: 'back', depth: 0.6 }, { item: 'front', depth: 0.2 }, { item: 'mid', depth: 0.4 }])).toBe('front');
    expect(nearest([])).toBeNull();
  });
});
