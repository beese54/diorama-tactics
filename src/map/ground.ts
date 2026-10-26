import { hash, valueNoise } from '../util/noise';
import { mulberry32 } from '../util/rng';
import { isBuilt, isLiquid } from './surface';
import { LIQUID_STYLES, TERRAIN, type LiquidStyle, type PaintStyle } from './terrain';
import { TERRAIN_IDS, TILE_PX, tileAt, type MapFile, type Tile } from './types';
import { ALL_FRAMES, LIQUIDS, paintLiquid } from './liquid';
import { propPlacement, PROPS } from './props';

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
/** How dark a prop's contact shadow is at its core, and where its dithered fade begins (fraction of its radius). */
const SHADOW_DARKEN = 0.62;
const SHADOW_FADE = 0.6;
/** Size of the light and dark patches inside a terrain, in tiles. */
const PATCH_SCALE = 2.6;
/** How much single pixels stray from their patch's shade (in ramp steps). */
const SPECKLE = 0.9;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/**
 * Alpha of liquid pixels in the ground image. The tops are drawn opaque whatever their alpha,
 * so it marks liquid for the weather shader: rain darkens and snow settles on land only.
 */
export const LIQUID_ALPHA = 250;
/** Alpha of roof pixels: snow settles on roofs, but rain doesn't pool on them. */
export const ROOF_ALPHA = 252;
const ROOF_STYLES: readonly PaintStyle[] = ['thatch', 'tiles'];

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

/**
 * Irregular stones for paving: each pixel belongs to the nearest of a lattice of jittered
 * points `size` px apart, and pixels nearly equidistant from two points are mortar. Computed
 * in world pixels, so the pattern runs on unbroken across tiles.
 */
function stoneAt(gx: number, gy: number, size: number) {
  const cx = Math.floor(gx / size);
  const cy = Math.floor(gy / size);
  let best = Infinity;
  let second = Infinity;
  let id = 0;
  let lean = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx;
      const iy = cy + dy;
      const ox = gx + 0.5 - (ix + 0.2 + 0.6 * hash(0x5701, ix, iy)) * size;
      const oy = gy + 0.5 - (iy + 0.2 + 0.6 * hash(0x5702, ix, iy)) * size;
      const d = Math.hypot(ox, oy);
      if (d < best) {
        second = best;
        best = d;
        id = hash(0x5703, ix, iy);
        lean = (ox + oy) / size; // < 0 on the stone's upper-left (sunlit) side
      } else if (d < second) second = d;
    }
  }
  return { mortar: second - best < 1.1, id, lean };
}

/**
 * Stone shade from its id. Rounded stones (cobbles) are also lit on the upper left and
 * shaded on the lower right; flat slabs (flagstones) only vary in tone.
 */
function paving(size: number, rounded: boolean) {
  return (px: Pixel, p: readonly string[]) => {
    const s = stoneAt(px.gx, px.gy, size);
    if (s.mortar) return p[2];
    if (rounded && s.lean < -0.32) return p[3];
    if ((rounded && s.lean > 0.3) || px.grain < 0.05) return p[1];
    const tone = s.id + (px.patch - 0.5) * 0.5;
    return tone < 0.45 ? p[0] : tone < 0.8 ? p[1] : p[3];
  };
}

/** Running bond of `w`×`h` px blocks; mossy where the patches run high when the palette has a moss colour. */
function bond(w: number, h: number) {
  return (px: Pixel, p: readonly string[]) => {
    const row = Math.floor(px.gy / h);
    const x = px.gx + (row & 1) * (w / 2);
    if (px.gy % h === 0 || x % w === 0) return p[2];
    if (p[4] && px.patch > 0.6 && px.grain < (px.patch - 0.6) * 2.4) return p[4];
    if (px.grain < 0.025) return p[2];
    if (px.gy % h === 1) return p[3];
    const id = hash(0x6b1d, Math.floor(x / w), row) + (px.patch - 0.5) * 0.4;
    return id < 0.5 ? p[0] : id < 0.85 ? p[1] : p[3];
  };
}

/**
 * Grass under fallen leaves: leaves lie two pixels wide, in drifts that thicken where the
 * patch noise runs high (under the trees), each leaf one of the palette's four colours.
 * Worked out per world pixel, so drifts run on across tiles.
 */
function fallenLeaves(px: Pixel, p: readonly string[]): string {
  const leaf = hash(0x1eaf, px.gx >> 1, px.gy);
  const drift = Math.max(0, px.patch - 0.35) / 0.65;
  if (leaf < 0.025 + 0.3 * drift * drift) return p[4 + Math.floor(hash(0x1eb0, px.gx >> 1, px.gy) * 4)];
  return ramp(1, 0, 2)(px, p);
}

/**
 * Lake ice: pale where it is thick, blue where it is clear, a dusting of snow and a few glints.
 * A few long cracks wander across it: the edges of big jittered plates, shown only where a
 * broad noise lets them through, so they start and stop instead of tiling the lake. All in
 * world pixels, so the cracks and tones run on across tiles.
 */
function lakeIce(px: Pixel, p: readonly string[]): string {
  const plate = stoneAt(px.gx + 0.37 * px.gy, px.gy, 44);
  const cracked = valueNoise(0x1ce, px.gx / 40, px.gy / 40) > 0.52;
  if (plate.mortar && cracked) return plate.lean < 0 ? p[3] : p[4];
  if (px.grain > 0.995) return p[3];
  if (px.patch > 0.7 && px.grain < (px.patch - 0.7) * 1.4) return p[5];
  const tone = px.patch + (plate.id - 0.5) * 0.15 + (px.dither - 0.5) * 0.25;
  return tone < 0.34 ? p[2] : tone < 0.64 ? p[1] : p[0];
}

/**
 * Heather: low dark shrub ground covered in clumps of purple-pink bells, the clumps thick
 * where the patch noise runs high and thin to bare peat-brown between. Blossom is laid in
 * three-pixel sprigs (a light bell over two darker), in world pixels, so drifts cross tiles.
 */
function heatherBloom(px: Pixel, p: readonly string[]): string {
  // Sprigs sit on a jittered 3-px lattice: each is a light bell over darker ones.
  const cx = Math.floor(px.gx / 3);
  const cy = Math.floor(px.gy / 3);
  const density = 0.3 + 0.6 * px.patch;
  if (hash(0x4ea7, cx, cy) < density) {
    const ox = Math.floor(hash(0x4ea8, cx, cy) * 2);
    const oy = Math.floor(hash(0x4ea9, cx, cy) * 2);
    const dx = px.gx - cx * 3 - ox;
    const dy = px.gy - cy * 3 - oy;
    if (dx === 0 && dy === 0) return p[hash(0x4eaa, cx, cy) < 0.35 ? 6 : 5];
    if ((dx === 0 && dy === 1) || (dx === 1 && dy === 1)) return p[4];
    if (dx === 1 && dy === 0 && px.grain < 0.5) return p[3];
  }
  return ramp(1, 0, 2)(px, p);
}

/** Raked gravel: pale stones of mixed size and tone, each a pixel or two, over a darker bed. */
function rakedGravel(px: Pixel, p: readonly string[]): string {
  const stone = hash(0x67a1, px.gx >> 1, px.gy >> 1);
  if (stone < 0.12) return p[2];
  if (stone > 0.86) return p[3];
  return ramp(1, 0)(px, p);
}

/**
 * A mown lawn: broad stripes where the mower ran one way and back, light and dark in turn,
 * running across the whole garden in world pixels. Within a stripe, the patches and speckle
 * keep it from looking flat.
 */
function mownLawn(px: Pixel, p: readonly string[]): string {
  const stripe = Math.floor((px.gx + px.gy * 0.02) / 24) & 1;
  if (px.grain < 0.04) return p[3];
  const tone = px.patch * 0.5 + (px.grain - 0.5) * 0.4 + (px.dither - 0.5) * 0.3 + (stripe ? 0.45 : 0);
  return tone < 0.2 ? p[1] : tone < 0.6 ? p[0] : p[2];
}

/** The clipped top of a hedge: tight clumps of leaves, lit on their upper-left edge. */
function clippedHedge(px: Pixel, p: readonly string[]): string {
  const clump = hash(0x4ed9, px.gx >> 1, px.gy >> 1);
  const lit = ((px.gx & 1) === 0 && (px.gy & 1) === 0) || px.grain > 0.9;
  return clump < 0.25 ? p[0] : lit ? p[3] : clump < 0.65 ? p[1] : p[2];
}

/**
 * Railway track running east-west: two steel rails on timber sleepers bedded in ballast.
 * The rails sit on fixed rows of each tile, so a line of rail tiles makes one straight track.
 */
function railTrack(px: Pixel, p: readonly string[]): string {
  const y = px.gy % TILE_PX;
  if (y === 4 || y === 11) return p[5];
  if (y === 5 || y === 12) return p[6];
  const sleeper = px.gx % 6;
  if (y >= 2 && y <= 13 && sleeper < 2) return sleeper === 0 && y !== 13 ? p[4] : p[3];
  if (y === 14 && sleeper < 2) return p[1];
  return rakedGravel(px, p);
}

/**
 * A zebra crossing over an east-west road: white bars across the carriageway, each running
 * with the traffic, two pixels deep with two of road between, inside a margin either side.
 */
function zebraCrossing(px: Pixel, p: readonly string[]): string {
  const x = px.gx % TILE_PX;
  const bar = (px.gy & 3) < 2 && x >= 2 && x < TILE_PX - 2;
  if (bar) return px.grain < 0.08 ? p[5] : p[4];
  return PAINTERS.asphalt.base(px, p);
}

/**
 * An expressway running east-west, one lane per row of tiles: a dashed white line between
 * lanes and darker tyre tracks worn into each lane.
 */
function expressway(px: Pixel, p: readonly string[]): string {
  const y = px.gy % TILE_PX;
  if (y === 0 && px.gx % 16 < 9) return px.grain < 0.1 ? p[3] : p[4];
  if ((y === 4 || y === 5 || y === 11 || y === 12) && px.grain > 0.25) return p[5];
  return PAINTERS.asphalt.base(px, p);
}

const PAINTERS: Record<Exclude<PaintStyle, LiquidStyle>, Painter> = {
  lanes: { base: expressway },
  zebra: { base: zebraCrossing },
  rails: { base: railTrack },
  gravel: { base: rakedGravel },
  lawn: { base: mownLawn },
  hedge: { base: clippedHedge },
  heather: { base: heatherBloom },
  ice: { base: lakeIce },
  leaves: { base: fallenLeaves, details: (put, rand, p) => tufts(put, rand, p[3], 4) },
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
  flagstone: { base: paving(7, false) },
  cobblestone: { base: paving(4, true) },
  blocks: { base: bond(16, 8) },
  // Square paving slabs with a slight tone per slab.
  slabs: {
    base(px, p) {
      if (px.gx % 8 === 0 || px.gy % 8 === 0) return p[2];
      const id = hash(0x2e9b, px.gx >> 3, px.gy >> 3);
      if (px.grain < 0.06) return p[1];
      return id < 0.7 ? p[0] : id < 0.9 ? p[1] : p[3];
    },
  },
  asphalt: { base: (px, p) => (px.grain < 0.05 ? p[3] : px.grain > 0.985 ? p[2] : ramp(1, 0)(px, p)) },
  // Straw thatch: bundles 5 px deep with a dark tie line, each strand its own shade.
  thatch: {
    base(px, p) {
      if (px.gy % 5 === 0) return p[2];
      const strand = hash(0x7a11, px.gx, Math.floor(px.gy / 5));
      return strand < 0.25 ? p[1] : strand > 0.85 ? p[3] : px.gy % 5 === 1 ? p[3] : p[0];
    },
  },
  // Clay roof tiles: courses 3 px deep, staggered, lit on top and shadowed underneath.
  tiles: {
    base(px, p) {
      const row = Math.floor(px.gy / 3);
      const x = px.gx + (row & 1) * 2;
      if (px.gy % 3 === 2) return p[2];
      if (x % 4 === 0) return p[1];
      if (px.gy % 3 === 0) return p[3];
      return px.grain < 0.1 ? p[1] : p[0];
    },
  },
  // Boards 4 px wide with staggered joints.
  planks: {
    base(px, p) {
      const row = px.gy >> 2;
      if (px.gy % 4 === 0) return p[2];
      if ((px.gx + Math.floor(hash(0x7c3a, 0, row) * 20)) % 20 === 0) return p[2];
      if (px.gy % 4 === 1) return p[3];
      return px.grain < 0.3 ? p[1] : p[0];
    },
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

/** The land part of the ground image, painted once: liquid pixels are left for the frames. */
export interface LandImage {
  width: number;
  height: number;
  /** Per pixel (row 0 = north): index into TERRAIN_IDS of the terrain drawn there. */
  material: Uint8Array;
  /** RGBA of the land pixels; liquid pixels are 0. */
  rgba: Uint8Array;
}

/** One liquid's animation frames (some or all of them), as liquid.ts paints them. */
export interface LiquidLayer {
  style: LiquidStyle;
  palette: string[];
  frames: Int8Array[];
}

export interface GroundImage {
  /** Pixels per side of the whole map (tiles × TILE_PX). */
  width: number;
  height: number;
  /** Per pixel (row 0 = north): index into TERRAIN_IDS of the terrain drawn there. */
  material: Uint8Array;
  /**
   * RGBA per liquid animation frame (row 0 = north); land pixels are identical in every frame.
   * A board can be shown with only frame 0 while the others are still being painted: those are missing until then.
   */
  frames: Uint8Array[];
  /** Emitted light per frame, same layout (lava glows); null when nothing on the map glows. */
  glow: Uint8Array[] | null;
}

/**
 * Which tile's terrain is drawn at world point (x, y), in tiles. Near a border the lookup is
 * pushed around by smooth noise plus per-pixel jitter, so terrains interlock in ragged,
 * natural edges that ignore the tile grid. Water keeps its exact shoreline (it follows the
 * geometry), land only blends across gentle height changes, and two kinds of paving meet
 * in a straight joint.
 */
function materialTile(map: MapFile, x: number, y: number, gx: number, gy: number): Tile {
  const own = tileAt(map, Math.floor(x), Math.floor(y))!;
  if (isLiquid(own)) return own;
  const wx = WARP * (2 * valueNoise(map.seed ^ 0x2c4f, x / WARP_SCALE, y / WARP_SCALE) - 1) + BORDER_JITTER * (hash(map.seed ^ 0x11b3, gx, gy) - 0.5);
  const wy = WARP * (2 * valueNoise(map.seed ^ 0x5d17, x / WARP_SCALE, y / WARP_SCALE) - 1) + BORDER_JITTER * (hash(map.seed ^ 0x47e9, gx, gy) - 0.5);
  const t = tileAt(map, Math.floor(x + wx), Math.floor(y + wy));
  // Paving meets paving in a straight line; nature frays into it and into itself.
  const crisp = t && isBuilt(t) && isBuilt(own);
  return t && !isLiquid(t) && !crisp && Math.abs(t.height - own.height) <= BLEND_STEPS ? t : own;
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
 * patches come from world-space noise rather than per-tile variants. Liquids come from
 * liquid.ts, one image per animation frame; `wild` (generated maps) turns water beside
 * swamps murky. Deterministic per map seed. The three steps can also run apart, on
 * workers (see BoardWorkers.ts): the result is the same.
 */
export function paintGround(map: MapFile, wild = false): GroundImage {
  return composeGround(paintLand(map), paintLiquids(map, wild));
}

/** Every land pixel of the ground image: terrain, its patches and details, and props' contact shadows. */
export function paintLand(map: MapFile): LandImage {
  const width = map.width * TILE_PX;
  const height = map.height * TILE_PX;
  const terrainIndex = new Map(TERRAIN_IDS.map((id, i) => [id, i]));
  const material = new Uint8Array(width * height);
  const land = new Uint8Array(width * height * 4);
  const write = (i: number, hex: string) => land.set([...rgb(hex), ROOF_STYLES.includes(TERRAIN[TERRAIN_IDS[material[i]]].style) ? ROOF_ALPHA : 255], i * 4);

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const i = gy * width + gx;
      const x = (gx + 0.5) / TILE_PX;
      const y = (gy + 0.5) / TILE_PX;
      const tile = materialTile(map, x, y, gx, gy);
      material[i] = terrainIndex.get(tile.terrain)!;
      if (isLiquid(tile)) continue;
      const n = valueNoise(map.seed ^ 0x6a09, x / PATCH_SCALE, y / PATCH_SCALE);
      const patch = Math.min(1, Math.max(0, (n - 0.5) * 1.6 + 0.5));
      const def = TERRAIN[tile.terrain];
      const painter = PAINTERS[def.style as Exclude<PaintStyle, LiquidStyle>];
      write(i, painter.base({ gx, gy, patch, grain: hash(map.seed ^ 0x3c6e, gx, gy), dither: BAYER4[(gy % 4) * 4 + (gx % 4)] }, def.palette));
    }
  }

  // Details stay on their own terrain, so they follow the ragged borders instead of the grid.
  for (const tile of map.tiles) {
    if (isLiquid(tile)) continue;
    const def = TERRAIN[tile.terrain];
    const own = terrainIndex.get(tile.terrain)!;
    const put: Put = (x, y, color) => {
      const gx = tile.x * TILE_PX + x;
      const gy = tile.y * TILE_PX + y;
      if (gx < 0 || gy < 0 || gx >= width || gy >= height || material[gy * width + gx] !== own) return;
      write(gy * width + gx, color);
    };
    PAINTERS[def.style as Exclude<PaintStyle, LiquidStyle>].details?.(put, mulberry32(Math.imul(map.seed, 0x9e3779b1) ^ Math.imul(tile.y * map.width + tile.x + 1, 7919)), def.palette);
  }

  // Contact shadows under props, so they sit on the ground instead of floating above it.
  const liquidAt = (i: number) => (LIQUID_STYLES as readonly string[]).includes(TERRAIN[TERRAIN_IDS[material[i]]].style);
  for (const tile of map.tiles) {
    if (!tile.prop || isLiquid(tile)) continue;
    const { u, v } = propPlacement(tile);
    const r = PROPS[tile.prop].shadow;
    const cx = (tile.x + u) * TILE_PX + 1; // the sun is up and to the left
    const cy = (tile.y + v) * TILE_PX;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const gx = Math.floor(cx + dx);
        const gy = Math.floor(cy + dy);
        const d = Math.hypot(dx, dy) / r;
        if (d > 1 || gx < 0 || gy < 0 || gx >= width || gy >= height) continue;
        const i = gy * width + gx;
        if (liquidAt(i) || (d > SHADOW_FADE && BAYER4[(gy % 4) * 4 + (gx % 4)] < (d - SHADOW_FADE) / (1 - SHADOW_FADE))) continue;
        for (let c = 0; c < 3; c++) land[i * 4 + c] *= SHADOW_DARKEN;
      }
    }
  }

  return { width, height, material, rgba: land };
}

/** The liquids on this map (water, lava), each painted for the frames in `only` (all by default). */
export function paintLiquids(map: MapFile, wild = false, only: readonly number[] = ALL_FRAMES): LiquidLayer[] {
  const present = LIQUID_STYLES.filter((style) => map.tiles.some((t) => TERRAIN[t.terrain].style === style));
  return present.map((style) => {
    const { palette, frames } = paintLiquid(map, TILE_PX, style, wild, only);
    return { style, palette, frames };
  });
}

/**
 * Lays the liquids over the land for the frames in `which` (all by default); each liquid's
 * `frames` hold those frames, in that order. Writes into `into` when given (filling in an image
 * whose other frames came earlier), else into a new image.
 */
export function composeGround(land: LandImage, liquids: LiquidLayer[], which: readonly number[] = ALL_FRAMES, into?: GroundImage): GroundImage {
  const { width, height, material } = land;
  const glowing = liquids.some((l) => LIQUIDS[l.style].glows);
  const image = into ?? { width, height, material, frames: [], glow: glowing ? [] : null };
  which.forEach((f, k) => {
    const frame = land.rgba.slice();
    const light = glowing ? new Uint8Array(width * height * 4) : null;
    for (const { style, palette, frames: painted } of liquids) {
      const colors = palette.map(rgb);
      const lit = !!light && LIQUIDS[style].glows;
      const index = painted[k];
      for (let i = 0; i < index.length; i++) {
        const c = index[i];
        if (c < 0) continue;
        const [r, g, b] = colors[c];
        frame[i * 4] = r;
        frame[i * 4 + 1] = g;
        frame[i * 4 + 2] = b;
        frame[i * 4 + 3] = LIQUID_ALPHA;
        if (lit) light!.set([r, g, b, 255], i * 4);
      }
    }
    image.frames[f] = frame;
    if (light) image.glow![f] = light;
  });
  return image;
}
