import { mulberry32 } from '../util/rng';
import { valueNoise } from '../util/noise';
import { isLiquid } from './surface';
import { TERRAIN, type LiquidStyle } from './terrain';
import { tileAt, type MapFile } from './types';

/** Frames in one animation loop, and how fast they play. Shared by every liquid. */
export const LIQUID_FRAMES = 12;
export const LIQUID_FPS = 6;

interface LiquidLook {
  /** Colour ramp from the shoreline outwards. */
  ramp: readonly string[];
  /** Glint colour for each ramp index. */
  glint: readonly string[];
  /** Depth (in tiles of distance from land) covered by one ramp band. */
  band: number;
  /** How far contours wobble, in tiles, and the size of the wobble. */
  wobble: number;
  wobbleScale: number;
  /** Radius (in noise cells) of the circle the wobble noise drifts around once per loop. */
  drift: number;
  /** Dark crust plates floating on the surface (lava): noise threshold above which a pixel is crust, and the crust colour. */
  crust?: { threshold: number; color: string };
  /** Whether the liquid lights itself (drawn into the ground's emissive image). */
  glows: boolean;
}

/** Shallow to deep water; lava runs from a dark crusted edge to a bright core. */
export const LIQUIDS: Record<LiquidStyle, LiquidLook> = {
  water: {
    ramp: ['#8cc0cc', '#5c97ad', '#4f8aa0', '#417893', '#346484', '#2c5576'],
    glint: ['#d8eef0', '#d8eef0', '#b4dae2', '#8cc0cc', '#6f9fba', '#5b8cab'],
    band: 0.3, wobble: 0.35, wobbleScale: 1.3, drift: 0.22, glows: false,
  },
  lava: {
    ramp: ['#5a2414', '#9a3414', '#d24a12', '#ee6a18', '#ff8a2a', '#ffad42'],
    glint: ['#ff8a2a', '#ffad42', '#ffd060', '#ffe08a', '#fff0b0', '#fff0b0'],
    band: 0.22, wobble: 0.45, wobbleScale: 1.6, drift: 0.3, glows: true,
    crust: { threshold: 0.74, color: '#3a1a12' },
  },
};

/** Water's ramp, kept for tests and callers that only care about water. */
export const WATER_RAMP = LIQUIDS.water.ramp;

/** A finer wobble on top, drifting the other way, so the surface churns instead of sliding. */
const RIPPLE = 0.12;
const RIPPLE_SCALE = 0.55;
/** Land further than this (in tiles) never affects a pixel's depth. */
const REACH = 3;
/** Ordered-dither matrix: soft, pixel-art transitions between bands. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const DITHER = 0.7;
/** Glints per liquid tile, the share of the loop each one is visible, and how far it drifts meanwhile (px). */
const GLINTS = 3;
const GLINT_LIFE = 0.4;
const GLINT_DRIFT = 2;

export interface LiquidImage {
  /** Pixels per side of the whole map (tiles × tilePx). */
  width: number;
  height: number;
  /** Colours the frames index into: the ramp, then the glints, then the crust. */
  palette: string[];
  /** One image per animation frame. Per pixel: index into `palette`, or -1 where this liquid isn't. */
  frames: Int8Array[];
}

/**
 * Paints every pixel of one liquid at once, so colour follows the real shoreline instead
 * of tile boundaries: banded by distance from land, with wobbly contours, dithered band
 * edges and sparse glints. Animated as a seamless loop: the contour noise drifts around a
 * circle and glints twinkle in and out on their own phase. Deterministic per map seed.
 */
export function paintLiquid(map: MapFile, tilePx: number, style: LiquidStyle): LiquidImage {
  const look = LIQUIDS[style];
  const ramp = look.ramp.length;
  const palette = [...look.ramp, ...new Set(look.glint)];
  const crustIndex = look.crust ? palette.push(look.crust.color) - 1 : -1;
  const glintIndex = (level: number) => palette.indexOf(look.glint[level]);
  const width = map.width * tilePx;
  const height = map.height * tilePx;
  const ours = (x: number, y: number) => {
    const t = tileAt(map, x, y);
    return !!t && TERRAIN[t.terrain].style === style;
  };
  const depth = shoreDistance(map, tilePx, ours);

  const rand = mulberry32(map.seed ^ 0x9a17);
  const glints = map.tiles.filter((t) => ours(t.x, t.y)).flatMap((tile) =>
    Array.from({ length: GLINTS }, (_, i) => ({
      gx: tile.x * tilePx + Math.floor(rand() * tilePx),
      gy: tile.y * tilePx + Math.floor(rand() * tilePx),
      // Two short ripples and one single-pixel sparkle per tile.
      length: i < 2 ? 2 + Math.floor(rand() * 3) : 1,
      phase: rand(),
    })),
  );

  const frames = Array.from({ length: LIQUID_FRAMES }, (_, f) => {
    const angle = (2 * Math.PI * f) / LIQUID_FRAMES;
    const [cx, cy] = [look.drift * Math.cos(angle), look.drift * Math.sin(angle)];
    const index = new Int8Array(width * height).fill(-1);
    for (let gy = 0; gy < height; gy++) {
      for (let gx = 0; gx < width; gx++) {
        const d = depth[gy * width + gx];
        if (d < 0) continue;
        const x = (gx + 0.5) / tilePx;
        const y = (gy + 0.5) / tilePx;
        const wobble =
          look.wobble * (2 * valueNoise(map.seed ^ 0x3e11, x / look.wobbleScale + cx, y / look.wobbleScale + cy) - 1) +
          RIPPLE * (2 * valueNoise(map.seed ^ 0x6b2d, x / RIPPLE_SCALE - cy, y / RIPPLE_SCALE - cx) - 1);
        // Wobble fades out at the shoreline so the edge band always hugs the land.
        const level = Math.max(0, d + wobble * Math.min(1, d / look.band)) / look.band;
        const dither = BAYER4[(gy % 4) * 4 + (gx % 4)];
        index[gy * width + gx] = Math.min(ramp - 1, Math.max(0, Math.floor(level + (dither - 0.5) * DITHER)));
        if (look.crust && d > look.band) {
          const plate = valueNoise(map.seed ^ 0x2f71, x / 0.9 - cy * 1.5, y / 0.9 + cx * 1.5);
          if (plate + (dither - 0.5) * 0.06 > look.crust.threshold) index[gy * width + gx] = crustIndex;
        }
      }
    }

    // Glints: short horizontal ripples and single sparkles, tinted for the band they sit on.
    const t = f / LIQUID_FRAMES;
    for (const g of glints) {
      const age = (t - g.phase + 1) % 1;
      if (age >= GLINT_LIFE) continue;
      const gx = g.gx + Math.floor((age / GLINT_LIFE) * (GLINT_DRIFT + 1));
      const level = index[g.gy * width + gx];
      if (gx >= width || level < 0 || level >= ramp) continue; // off the liquid, on crust, or already a glint
      for (let k = 0; k < g.length && gx + k < width; k++) {
        if (index[g.gy * width + gx + k] >= 0) index[g.gy * width + gx + k] = glintIndex(level);
      }
    }
    return index;
  });
  return { width, height, palette, frames };
}

/** Per pixel: distance in tiles from a liquid pixel to the nearest non-liquid square (capped at REACH), or -1 elsewhere. */
function shoreDistance(map: MapFile, tilePx: number, ours: (x: number, y: number) => boolean): Float32Array {
  const width = map.width * tilePx;
  const depth = new Float32Array(width * map.height * tilePx).fill(-1);
  for (const tile of map.tiles) {
    if (!ours(tile.x, tile.y)) continue;
    const land: [number, number][] = [];
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const t = tileAt(map, tile.x + dx, tile.y + dy);
        if (t && !isLiquid(t)) land.push([t.x, t.y]);
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
