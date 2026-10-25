import { describe, expect, it } from 'vitest';
import { buildMap, type Cell } from './build';
import { LIQUID_FRAMES, paintLiquid, WATER_RAMP } from './liquid';
import { FALL_PATTERN_PX, paintWaterfall } from './waterfall';
import type { WaterInfo } from './types';

const PX = 16;
const SIZE = 8;

/** An 8×8 meadow with water wherever `water` says, at the height it gives. */
function mapWith(water: (x: number, y: number) => { height: number; info: WaterInfo } | null) {
  return buildMap(5, SIZE, (x, y): Cell => {
    const w = water(x, y);
    return w ? { terrain: 'shallow_water', height: w.height, water: w.info } : { terrain: 'plains', height: 3 };
  });
}

/** Across all frame steps, the sideways shift (px) that best lines one frame's glints up with the next frame's. */
function drift(frames: Int8Array[], width: number, rows: [number, number]): number {
  const glint = (c: number) => c >= WATER_RAMP.length;
  let best = 0;
  let bestScore = -1;
  for (let shift = -4; shift <= 4; shift++) {
    let score = 0;
    for (let f = 0; f < frames.length; f++) {
      const [a, b] = [frames[f], frames[(f + 1) % frames.length]];
      for (let y = rows[0]; y < rows[1]; y++) {
        for (let x = 8; x < width - 8; x++) if (glint(a[y * width + x]) && glint(b[y * width + x + shift])) score++;
      }
    }
    if (score > bestScore) [best, bestScore] = [shift, score];
  }
  return best;
}

describe('running water', () => {
  const river = (dx: number) => mapWith((_, y) => (y === 3 || y === 4 ? { height: 0, info: { kind: 'river', flow: [dx, 0] } } : null));

  it('carries its ripples downstream', () => {
    const rows: [number, number] = [3 * PX + 4, 5 * PX - 4];
    expect(drift(paintLiquid(river(1), PX, 'water').frames, SIZE * PX, rows)).toBeGreaterThan(0);
    expect(drift(paintLiquid(river(-1), PX, 'water').frames, SIZE * PX, rows)).toBeLessThan(0);
  });

  it('still loops without a jump', () => {
    const { frames } = paintLiquid(river(1), PX, 'water');
    expect(frames).toHaveLength(LIQUID_FRAMES);
    const changed = (a: Int8Array, b: Int8Array) => a.filter((c, i) => c >= 0 && c !== b[i]).length / a.filter((c) => c >= 0).length;
    const steps = frames.map((f, k) => changed(f, frames[(k + 1) % frames.length]));
    // The wrap from the last frame to the first is no bigger a change than the others.
    expect(steps[LIQUID_FRAMES - 1]).toBeLessThan(Math.max(...steps.slice(0, -1)) * 1.5);
  });
});

describe('foam', () => {
  const foamCount = (frames: Int8Array[], palette: string[], pick: (x: number, y: number) => boolean) => {
    const white = new Set(['#f4faf8', '#c8e4ea'].map((c) => palette.indexOf(c)));
    let n = 0;
    for (const frame of frames) frame.forEach((c, i) => white.has(c) && pick(i % (SIZE * PX), Math.floor(i / (SIZE * PX))) && n++);
    return n;
  };

  it('churns at the foot of a waterfall, not at its top', () => {
    // A river along row 3: x 0-3 at height 2 pours over into x 4-7 at height 1.
    const map = mapWith((x, y) => (y === 3 ? { height: x < 4 ? 2 : 1, info: { kind: x === 3 ? 'waterfall' : 'river', flow: [1, 0] } } : null));
    const { frames, palette } = paintLiquid(map, PX, 'water');
    const foot = foamCount(frames, palette, (x, y) => x >= 4 * PX && x < 4 * PX + 4 && y >= 3 * PX && y < 4 * PX);
    const top = foamCount(frames, palette, (x, y) => x < 3 * PX && y >= 3 * PX && y < 4 * PX);
    expect(foot).toBeGreaterThan(LIQUID_FRAMES * PX);
    expect(top).toBe(0);
  });

  it('washes up the shore of the sea, but not of a lake', () => {
    const shore = (kind: 'sea' | 'lake') => {
      const map = mapWith((x) => (x >= 4 ? { height: 0, info: { kind, flow: [0, 0] } } : null));
      const { frames, palette } = paintLiquid(map, PX, 'water');
      return foamCount(frames, palette, (x) => x >= 4 * PX && x < 4 * PX + 3);
    };
    expect(shore('sea')).toBeGreaterThan(0);
    expect(shore('lake')).toBe(0);
  });
});

describe('waterfall face', () => {
  const fall = paintWaterfall();
  const row = (f: number, r: number) => fall.frames[f].slice(r * fall.width * 4, (r + 1) * fall.width * 4).join();

  it('falls: each frame shows the pattern from a little higher up, wrapping round', () => {
    const step = FALL_PATTERN_PX / LIQUID_FRAMES;
    for (let f = 0; f < LIQUID_FRAMES; f++) {
      for (let r = 0; r < FALL_PATTERN_PX; r++) expect(row((f + 1) % LIQUID_FRAMES, r)).toBe(row(f, (r + step) % FALL_PATTERN_PX));
    }
  });

  it('is opaque water, light and dark', () => {
    const shades = new Set<string>();
    for (let i = 0; i < fall.frames[0].length; i += 4) {
      expect(fall.frames[0][i + 3]).toBe(255);
      shades.add(fall.frames[0].slice(i, i + 3).join());
    }
    expect(shades.size).toBeGreaterThanOrEqual(4);
  });
});
