import { mulberry32 } from '../util/rng';
import { valueNoise } from '../util/noise';
import { isWater } from './surface';
import { tileAt, type MapFile } from './types';

/** Depth ramp from the shoreline out to the deepest water. */
export const WATER_RAMP = ['#8cc0cc', '#5c97ad', '#4f8aa0', '#417893', '#346484', '#2c5576'] as const;
/** Glints and ripples, by ramp index: pale on shallow water, muted on deep. */
const GLINT = ['#d8eef0', '#d8eef0', '#b4dae2', '#8cc0cc', '#6f9fba', '#5b8cab'] as const;
export const WATER_PALETTE = [...WATER_RAMP, ...new Set(GLINT)];

/** Depth (in tiles of distance from land) covered by one ramp band. */
const BAND = 0.3;
/** How far contours wobble, in tiles, and the size of the wobble. */
const WOBBLE = 0.35;
const WOBBLE_SCALE = 1.3;
/** Land further than this (in tiles) never affects a pixel's depth. */
const REACH = 3;
/** Ordered-dither matrix: soft, pixel-art transitions between bands. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const DITHER = 0.7;

export interface WaterImage {
  /** Pixels per side of the whole map (tiles × tilePx). */
  width: number;
  height: number;
  /** Per pixel: index into WATER_PALETTE, or -1 for land. */
  index: Int8Array;
}

/**
 * Paints every water pixel of the map at once, so colour follows the real shoreline
 * instead of tile boundaries: shallow near land, deeper with distance, with wobbly
 * contours, dithered band edges and sparse glints. Deterministic per map seed.
 */
export function paintWater(map: MapFile, tilePx: number): WaterImage {
  const width = map.width * tilePx;
  const height = map.height * tilePx;
  const index = new Int8Array(width * height).fill(-1);
  const glintIndex = (ramp: number) => WATER_PALETTE.indexOf(GLINT[ramp]);

  for (const tile of map.tiles) {
    if (!isWater(tile)) continue;
    const land: [number, number][] = [];
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const t = tileAt(map, tile.x + dx, tile.y + dy);
        if (t && !isWater(t)) land.push([t.x, t.y]);
      }
    }
    for (let py = 0; py < tilePx; py++) {
      for (let px = 0; px < tilePx; px++) {
        const gx = tile.x * tilePx + px;
        const gy = tile.y * tilePx + py;
        const x = (gx + 0.5) / tilePx;
        const y = (gy + 0.5) / tilePx;
        let depth = REACH;
        for (const [lx, ly] of land) {
          depth = Math.min(depth, Math.hypot(Math.max(lx - x, 0, x - lx - 1), Math.max(ly - y, 0, y - ly - 1)));
        }
        const wobble = WOBBLE * (2 * valueNoise(map.seed ^ 0x3e11, x / WOBBLE_SCALE, y / WOBBLE_SCALE) - 1);
        // Wobble fades out at the waterline so the shore band always hugs the land.
        const level = Math.max(0, depth + wobble * Math.min(1, depth / BAND)) / BAND;
        const ramp = Math.min(WATER_RAMP.length - 1, Math.max(0, Math.floor(level + (BAYER4[(gy % 4) * 4 + (gx % 4)] - 0.5) * DITHER)));
        index[gy * width + gx] = ramp;
      }
    }
  }

  // Glints: short horizontal ripples and single sparkles, tinted for the depth they sit on.
  const rand = mulberry32(map.seed ^ 0x9a17);
  for (const tile of map.tiles) {
    if (!isWater(tile)) continue;
    for (let i = 0; i < 3; i++) {
      const gx = tile.x * tilePx + Math.floor(rand() * tilePx);
      const gy = tile.y * tilePx + Math.floor(rand() * tilePx);
      const length = i < 2 ? 2 + Math.floor(rand() * 3) : 1;
      const ramp = index[gy * width + gx];
      if (ramp < 0 || ramp >= WATER_RAMP.length) continue; // already a glint
      for (let k = 0; k < length && gx + k < width; k++) {
        if (index[gy * width + gx + k] >= 0) index[gy * width + gx + k] = glintIndex(ramp);
      }
    }
  }
  return { width, height, index };
}
