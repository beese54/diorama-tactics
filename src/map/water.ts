import { mulberry32 } from '../util/rng';
import { valueNoise } from '../util/noise';
import { isWater } from './surface';
import { tileAt, type MapFile } from './types';

/** Depth ramp from the shoreline out to the deepest water. */
export const WATER_RAMP = ['#8cc0cc', '#5c97ad', '#4f8aa0', '#417893', '#346484', '#2c5576'] as const;
/** Glints and ripples, by ramp index: pale on shallow water, muted on deep. */
const GLINT = ['#d8eef0', '#d8eef0', '#b4dae2', '#8cc0cc', '#6f9fba', '#5b8cab'] as const;
export const WATER_PALETTE = [...WATER_RAMP, ...new Set(GLINT)];

/** Frames in one animation loop, and how fast they play. */
export const WATER_FRAMES = 12;
export const WATER_FPS = 6;

/** Depth (in tiles of distance from land) covered by one ramp band. */
const BAND = 0.3;
/** How far contours wobble, in tiles, and the size of the wobble. */
const WOBBLE = 0.35;
const WOBBLE_SCALE = 1.3;
/** A finer wobble on top, drifting the other way, so the surface churns instead of sliding. */
const RIPPLE = 0.12;
const RIPPLE_SCALE = 0.55;
/** Radius (in noise cells) of the circle the wobble noise drifts around once per loop. */
const DRIFT = 0.22;
/** Land further than this (in tiles) never affects a pixel's depth. */
const REACH = 3;
/** Ordered-dither matrix: soft, pixel-art transitions between bands. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const DITHER = 0.7;
/** Glints per water tile, the share of the loop each one is visible, and how far it drifts meanwhile (px). */
const GLINTS = 3;
const GLINT_LIFE = 0.4;
const GLINT_DRIFT = 2;

export interface WaterImage {
  /** Pixels per side of the whole map (tiles × tilePx). */
  width: number;
  height: number;
  /** One image per animation frame. Per pixel: index into WATER_PALETTE, or -1 for land. */
  frames: Int8Array[];
}

/**
 * Paints every water pixel of the map at once, so colour follows the real shoreline
 * instead of tile boundaries: shallow near land, deeper with distance, with wobbly
 * contours, dithered band edges and sparse glints. Animated as a seamless loop: the
 * contour noise drifts around a circle and glints twinkle in and out on their own phase.
 * Deterministic per map seed.
 */
export function paintWater(map: MapFile, tilePx: number): WaterImage {
  const width = map.width * tilePx;
  const height = map.height * tilePx;
  const depth = shoreDistance(map, tilePx);
  const glintIndex = (ramp: number) => WATER_PALETTE.indexOf(GLINT[ramp]);

  const rand = mulberry32(map.seed ^ 0x9a17);
  const glints = map.tiles.filter(isWater).flatMap((tile) =>
    Array.from({ length: GLINTS }, (_, i) => ({
      gx: tile.x * tilePx + Math.floor(rand() * tilePx),
      gy: tile.y * tilePx + Math.floor(rand() * tilePx),
      // Two short ripples and one single-pixel sparkle per tile.
      length: i < 2 ? 2 + Math.floor(rand() * 3) : 1,
      phase: rand(),
    })),
  );

  const frames = Array.from({ length: WATER_FRAMES }, (_, f) => {
    const angle = (2 * Math.PI * f) / WATER_FRAMES;
    const [cx, cy] = [DRIFT * Math.cos(angle), DRIFT * Math.sin(angle)];
    const index = new Int8Array(width * height).fill(-1);
    for (let gy = 0; gy < height; gy++) {
      for (let gx = 0; gx < width; gx++) {
        const d = depth[gy * width + gx];
        if (d < 0) continue;
        const x = (gx + 0.5) / tilePx;
        const y = (gy + 0.5) / tilePx;
        const wobble =
          WOBBLE * (2 * valueNoise(map.seed ^ 0x3e11, x / WOBBLE_SCALE + cx, y / WOBBLE_SCALE + cy) - 1) +
          RIPPLE * (2 * valueNoise(map.seed ^ 0x6b2d, x / RIPPLE_SCALE - cy, y / RIPPLE_SCALE - cx) - 1);
        // Wobble fades out at the waterline so the shore band always hugs the land.
        const level = Math.max(0, d + wobble * Math.min(1, d / BAND)) / BAND;
        index[gy * width + gx] = Math.min(WATER_RAMP.length - 1, Math.max(0, Math.floor(level + (BAYER4[(gy % 4) * 4 + (gx % 4)] - 0.5) * DITHER)));
      }
    }

    // Glints: short horizontal ripples and single sparkles, tinted for the depth they sit on.
    const t = f / WATER_FRAMES;
    for (const g of glints) {
      const age = (t - g.phase + 1) % 1;
      if (age >= GLINT_LIFE) continue;
      const gx = g.gx + Math.floor((age / GLINT_LIFE) * (GLINT_DRIFT + 1));
      const ramp = index[g.gy * width + gx];
      if (gx >= width || ramp < 0 || ramp >= WATER_RAMP.length) continue; // off the water, or already a glint
      for (let k = 0; k < g.length && gx + k < width; k++) {
        if (index[g.gy * width + gx + k] >= 0) index[g.gy * width + gx + k] = glintIndex(ramp);
      }
    }
    return index;
  });
  return { width, height, frames };
}

/** Per pixel: distance in tiles from a water pixel to the nearest land square (capped at REACH), or -1 on land. */
function shoreDistance(map: MapFile, tilePx: number): Float32Array {
  const width = map.width * tilePx;
  const depth = new Float32Array(width * map.height * tilePx).fill(-1);
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
        let d = REACH;
        for (const [lx, ly] of land) d = Math.min(d, Math.hypot(Math.max(lx - x, 0, x - lx - 1), Math.max(ly - y, 0, y - ly - 1)));
        depth[gy * width + gx] = d;
      }
    }
  }
  return depth;
}
