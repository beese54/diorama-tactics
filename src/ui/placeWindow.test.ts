import { describe, expect, it } from 'vitest';
import { placeWindow } from './placeWindow';

const view = { w: 1920, h: 1080 };
const size = { w: 400, h: 160 };
const inside = (p: { left: number; top: number }, bottom = 0) =>
  p.left >= 0 && p.top >= 0 && p.left + size.w <= view.w && p.top + size.h <= view.h - bottom;

describe('placeWindow', () => {
  it('goes up and to the right of the point, clear of it', () => {
    expect(placeWindow({ x: 900, y: 400 }, size, view)).toEqual({ left: 924, top: 216 });
  });

  it('goes below the point when there is no room above', () => {
    expect(placeWindow({ x: 900, y: 100 }, size, view).top).toBe(124);
  });

  it('goes to the left near the right edge', () => {
    const p = placeWindow({ x: 1700, y: 400 }, size, view);
    expect(p.left + size.w).toBeLessThanOrEqual(1700);
    expect(inside(p)).toBe(true);
  });

  it('stays on screen at every corner, and clear of the reserved bottom', () => {
    for (const x of [0, 5, 960, 1915, 1920]) {
      for (const y of [0, 5, 540, 1000, 1080]) {
        expect(inside(placeWindow({ x, y }, size, view, { bottom: 130 }), 130)).toBe(true);
      }
    }
  });

  it('never covers the point it describes when there is room beside it', () => {
    for (const x of [100, 960, 1800]) {
      const p = placeWindow({ x, y: 500 }, size, view);
      expect(x < p.left || x > p.left + size.w).toBe(true);
    }
  });
});
