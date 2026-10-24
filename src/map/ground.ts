import { hash, valueNoise } from '../util/noise';
import { mulberry32 } from '../util/rng';
import { isWater } from './surface';
import { TERRAIN, type PaintStyle } from './terrain';
import { TILE_PX } from './textures';
import { TERRAIN_IDS, tileAt, type MapFile, type Tile } from './types';
import { paintWater, WATER_PALETTE } from './water';

/**
 * How far terrain borders wander into the neighbouring tile, in tiles, and the size of
 * the wandering. Kept under half a tile so every tile's centre shows its own terrain.
 */
const WARP = 0.3;
const WARP_SCALE = 0.9;
/** Per-pixel jitter on a border, so it frays into scattered pixels instead of a clean curve. */
const BORDER_JITTER = 0.16;
/** Terrains only blend across a height change this small; taller cliffs keep their own top. */
const BLEND_STEPS = 1;
/** Size of the light and dark patches inside a terrain, in tiles. */
const PATCH_SCALE = 2.6;
/** How much single pixels stray from their patch's shade (in ramp steps). */
const SPECKLE = 0.9;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

type Rand = () => number;
/** Draws one detail pixel at tile-local (x, y); it may spill into neighbouring tiles of the same terrain. */
type Put = (x: number, y: number, color: string) => void;

interface Pixel {
  gx: number;
  gy: number;
  /** Smooth world-space noise in [0, 1]: which light/dark patch this pixel sits in. */
  patch: number;
  /** Per-pixel white noise in [0, 1). */
  grain: number;
  /** Ordered-dither threshold in [0, 1). */
  dither: number;
}

interface Painter {
  base: (px: Pixel, p: readonly string[]) => string;
  /** Small details scattered over each tile: tufts, stones, tree clumps. */
  details?: (put: Put, rand: Rand, p: readonly string[]) => void;
}

const int = (rand: Rand, n: number) => Math.floor(rand() * n);
const pick = <T,>(items: readonly T[], rand: Rand) => items[int(rand, items.length)];

/** Base colour from palette slots ordered dark to light: patches pick the shade, speckle and dither soften it. */
const ramp =
  (...slots: number[]) =>
  (px: Pixel, p: readonly string[]) => {
    const level = px.patch * (slots.length - 1) + (px.grain - 0.5) * SPECKLE + (px.dither - 0.5);
    return p[slots[Math.min(slots.length - 1, Math.max(0, Math.round(level)))]];
  };

function disc(put: Put, cx: number, cy: number, r: number, color: string): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) put(cx + x, cy + y, color);
  }
}

function tufts(put: Put, rand: Rand, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = int(rand, TILE_PX);
    const y = int(rand, TILE_PX);
    put(x, y, color);
    put(x, y + 1, color);
  }
}

function treeClumps(put: Put, rand: Rand, p: readonly string[], count: number): void {
  for (let i = 0; i < count; i++) {
    const cx = int(rand, TILE_PX);
    const cy = int(rand, TILE_PX);
    disc(put, cx + 1, cy + 1, 3, p[0]); // shadow, lower right
    disc(put, cx, cy, 3, p[2]);
    put(cx - 1, cy - 1, p[3]); // sun highlight, upper left
    put(cx - 2, cy, p[3]);
  }
}

const PAINTERS: Record<Exclude<PaintStyle, 'water'>, Painter> = {
  grass: { base: ramp(1, 0, 2), details: (put, rand, p) => tufts(put, rand, p[3], 6) },
  flowers: {
    base: ramp(1, 0, 2),
    details(put, rand, p) {
      tufts(put, rand, p[3], 4);
      for (let i = 0; i < 3; i++) put(int(rand, TILE_PX), int(rand, TILE_PX), pick(p.slice(4), rand));
    },
  },
  // Furrows run unbroken across a whole field.
  rows: { base: (px, p) => (px.grain < 0.06 + 0.18 * px.patch ? p[2] : px.gy % 4 < 2 ? p[0] : p[1]) },
  cobble: {
    base: ramp(1, 0),
    details(put, rand, p) {
      for (let i = 0; i < 6; i++) {
        const x = int(rand, TILE_PX);
        const y = int(rand, TILE_PX);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(x + dx, y + dy, p[2]);
        put(x, y, p[3]);
      }
    },
  },
  woods: { base: ramp(1, 0), details: (put, rand, p) => treeClumps(put, rand, p, 2) },
  canopy: { base: ramp(0, 1), details: (put, rand, p) => treeClumps(put, rand, p, 5) },
  rock: {
    base: ramp(1, 0),
    details(put, rand, p) {
      for (let c = 0; c < 2; c++) {
        let x = int(rand, TILE_PX);
        let y = int(rand, TILE_PX);
        for (let s = 0; s < 6; s++) {
          put(x, y, p[2]);
          x += rand() < 0.5 ? 1 : 0;
          y += 1;
        }
      }
      for (let i = 0; i < 5; i++) put(int(rand, TILE_PX), int(rand, TILE_PX), p[3]);
    },
  },
  snow: {
    base: ramp(1, 0),
    details(put, rand, p) {
      for (let i = 0; i < 6; i++) put(int(rand, TILE_PX), int(rand, TILE_PX), p[2]);
    },
  },
  swamp: {
    base: ramp(0, 1),
    details(put, rand, p) {
      disc(put, int(rand, TILE_PX), int(rand, TILE_PX), 2 + int(rand, 2), p[2]);
      for (let i = 0; i < 5; i++) {
        const x = int(rand, TILE_PX);
        const y = int(rand, TILE_PX);
        put(x, y, p[3]);
        put(x, y + 1, p[3]);
        if (rand() < 0.5) put(x, y + 2, p[3]);
      }
    },
  },
  // Wind ripples run diagonally across the whole dune field, bending with the patches.
  sand: {
    base: (px, p) => (((px.gy + (px.gx >> 1) + Math.floor(px.patch * 6)) & 7) === 0 && px.grain < 0.85 ? p[2] : ramp(1, 0)(px, p)),
  },
  crystal: {
    base: ramp(0, 1),
    details(put, rand, p) {
      for (let i = 0; i < 3; i++) {
        const x = int(rand, TILE_PX);
        const y = int(rand, TILE_PX);
        put(x, y, p[3]);
        put(x, y + 1, p[2]);
        put(x, y + 2, p[2]);
        put(x + 1, y + 2, p[2]);
      }
    },
  },
};

export interface GroundImage {
  /** Pixels per side of the whole map (tiles × TILE_PX). */
  width: number;
  height: number;
  /** Per pixel (row 0 = north): index into TERRAIN_IDS of the terrain drawn there. */
  material: Uint8Array;
  /** RGBA per water animation frame (row 0 = north); land pixels are identical in every frame. */
  frames: Uint8Array[];
}

/**
 * Which tile's terrain is drawn at world point (x, y), in tiles. Near a border the lookup is
 * pushed around by smooth noise plus per-pixel jitter, so terrains interlock in ragged,
 * natural edges that ignore the tile grid. Water keeps its exact shoreline (it follows the
 * geometry), and land only blends across gentle height changes.
 */
function materialTile(map: MapFile, x: number, y: number, gx: number, gy: number): Tile {
  const own = tileAt(map, Math.floor(x), Math.floor(y))!;
  if (isWater(own)) return own;
  const wx = WARP * (2 * valueNoise(map.seed ^ 0x2c4f, x / WARP_SCALE, y / WARP_SCALE) - 1) + BORDER_JITTER * (hash(map.seed ^ 0x11b3, gx, gy) - 0.5);
  const wy = WARP * (2 * valueNoise(map.seed ^ 0x5d17, x / WARP_SCALE, y / WARP_SCALE) - 1) + BORDER_JITTER * (hash(map.seed ^ 0x47e9, gx, gy) - 0.5);
  const t = tileAt(map, Math.floor(x + wx), Math.floor(y + wy));
  return t && !isWater(t) && Math.abs(t.height - own.height) <= BLEND_STEPS ? t : own;
}

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) rgbCache.set(hex, (c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]));
  return c;
}

/**
 * Paints every tile top of the map as one image, so colour flows across tile borders the
 * way it does outdoors: terrains fray into each other, and each terrain's light and dark
 * patches come from world-space noise rather than per-tile variants. Water comes from
 * water.ts, one image per animation frame. Deterministic per map seed.
 */
export function paintGround(map: MapFile): GroundImage {
  const width = map.width * TILE_PX;
  const height = map.height * TILE_PX;
  const terrainIndex = new Map(TERRAIN_IDS.map((id, i) => [id, i]));
  const material = new Uint8Array(width * height);
  const land = new Uint8Array(width * height * 4);
  const write = (i: number, hex: string) => land.set([...rgb(hex), 255], i * 4);

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const i = gy * width + gx;
      const x = (gx + 0.5) / TILE_PX;
      const y = (gy + 0.5) / TILE_PX;
      const tile = materialTile(map, x, y, gx, gy);
      material[i] = terrainIndex.get(tile.terrain)!;
      if (isWater(tile)) continue;
      const n = valueNoise(map.seed ^ 0x6a09, x / PATCH_SCALE, y / PATCH_SCALE);
      const patch = Math.min(1, Math.max(0, (n - 0.5) * 1.6 + 0.5));
      const def = TERRAIN[tile.terrain];
      const painter = PAINTERS[def.style as Exclude<PaintStyle, 'water'>];
      write(i, painter.base({ gx, gy, patch, grain: hash(map.seed ^ 0x3c6e, gx, gy), dither: BAYER4[(gy % 4) * 4 + (gx % 4)] }, def.palette));
    }
  }

  // Details stay on their own terrain, so they follow the ragged borders instead of the grid.
  for (const tile of map.tiles) {
    if (isWater(tile)) continue;
    const def = TERRAIN[tile.terrain];
    const own = terrainIndex.get(tile.terrain)!;
    const put: Put = (x, y, color) => {
      const gx = tile.x * TILE_PX + x;
      const gy = tile.y * TILE_PX + y;
      if (gx < 0 || gy < 0 || gx >= width || gy >= height || material[gy * width + gx] !== own) return;
      write(gy * width + gx, color);
    };
    PAINTERS[def.style as Exclude<PaintStyle, 'water'>].details?.(put, mulberry32(Math.imul(map.seed, 0x9e3779b1) ^ Math.imul(tile.y * map.width + tile.x + 1, 7919)), def.palette);
  }

  const water = paintWater(map, TILE_PX);
  const frames = water.frames.map((index) => {
    const frame = land.slice();
    index.forEach((c, i) => c >= 0 && frame.set([...rgb(WATER_PALETTE[c]), 255], i * 4));
    return frame;
  });
  return { width, height, material, frames };
}
