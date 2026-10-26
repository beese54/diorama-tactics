import { mulberry32 } from '../util/rng';
import { LIQUID_FRAMES } from './liquid';
import { TILE_PX } from './types';

/** Height of the falling-water pattern in px: it repeats every this many, and slides down by FALL_PX * LIQUID_FRAMES per loop. */
export const FALL_PATTERN_PX = 24;
const FALL_PX = FALL_PATTERN_PX / LIQUID_FRAMES;
/** Water colours of a fall, darkest first, and how often each shows. */
const FALL_COLORS = ['#4f8aa0', '#6fa8bc', '#8cc0cc', '#b4dae2', '#e4f2f2'];
const FALL_WEIGHTS = [0.12, 0.3, 0.3, 0.18, 0.1];

export interface WaterfallImage {
  width: number;
  height: number;
  /** One RGBA image per animation frame, row 0 at the bottom (as a texture samples it). */
  frames: Uint8Array[];
}

const rgb = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

/**
 * The face of a waterfall: vertical streaks of light and dark water, one tile wide, that
 * slide down a couple of pixels a frame and wrap, so the loop closes without a jump.
 */
export function paintWaterfall(seed = 1): WaterfallImage {
  const rand = mulberry32(seed ^ 0xfa11);
  const pick = () => {
    let r = rand();
    for (let k = 0; k < FALL_WEIGHTS.length; k++) if ((r -= FALL_WEIGHTS[k]) < 0) return k;
    return FALL_WEIGHTS.length - 1;
  };
  // Each column is a chain of streaks 2-7 px long, wrapping round the pattern's height.
  const pattern: number[][] = Array.from({ length: TILE_PX }, () => {
    const column: number[] = [];
    while (column.length < FALL_PATTERN_PX) {
      const shade = pick();
      for (let n = 2 + Math.floor(rand() * 6); n > 0 && column.length < FALL_PATTERN_PX; n--) column.push(shade);
    }
    return column;
  });
  const colors = FALL_COLORS.map(rgb);
  const frames = Array.from({ length: LIQUID_FRAMES }, (_, f) => {
    const data = new Uint8Array(TILE_PX * FALL_PATTERN_PX * 4);
    for (let row = 0; row < FALL_PATTERN_PX; row++) {
      for (let x = 0; x < TILE_PX; x++) {
        // Higher rows are higher up the face; each frame shows the pattern from a little further up, so it falls.
        const shade = pattern[x][(row + f * FALL_PX) % FALL_PATTERN_PX];
        data.set([...colors[shade], 255], (row * TILE_PX + x) * 4);
      }
    }
    return data;
  });
  return { width: TILE_PX, height: FALL_PATTERN_PX, frames };
}
