import { valueNoise } from '../util/noise';
import { LIQUID_STYLES, TERRAIN, type LiquidStyle } from './terrain';
import { tileAt, type MapFile, type TerrainId, type Tile } from './types';

export const STEP_HEIGHT = 0.5;
/**
 * How far in from an edge the rounding reaches, in tiles. It varies across the map
 * between these bounds; the maximum stays under half a tile so opposite rims never meet.
 */
export const RIM_WIDTH_MIN = 0.22;
export const RIM_WIDTH_MAX = 0.46;
/** Average lip drop and foot rise; they always sum to one step, so a one-step change stays one seamless slope. */
export const RIM_DROP = 0.25;
export const FOOT_RISE = STEP_HEIGHT - RIM_DROP;
/** How far the lip/foot balance can shift (fraction of RIM_DROP), so slopes sit higher or lower in places. */
export const BALANCE_SHIFT = 0.4;
/** How far a lip curves down towards lower water: a full step, so banks slope right to the waterline. */
export const BANK_DROP = STEP_HEIGHT;
/** Size of the shape-variation blobs, in tiles. */
const VARIATION_SCALE = 1.7;
/** Spans per rim in the mesh; the rim never reaches past RIM_WIDTH_MAX. */
const RIM_SPANS = 5;
/** Sample positions across a tile (each axis): spans through each rim, one across the flat middle. */
export const SAMPLES = Array.from({ length: RIM_SPANS + 1 }, (_, k) => (k / RIM_SPANS) * RIM_WIDTH_MAX);
SAMPLES.push(...SAMPLES.map((t) => 1 - t).reverse());

const TERRAIN_IDS = Object.keys(TERRAIN) as TerrainId[];
const LIQUID = new Set(TERRAIN_IDS.filter((id) => LIQUID_STYLES.includes(TERRAIN[id].style as LiquidStyle)));
const BUILT = new Set(TERRAIN_IDS.filter((id) => TERRAIN[id].shape === 'built'));

export const isLiquid = (tile: Tile) => LIQUID.has(tile.terrain);
/** Paving, walls and buildings: flat tops and sharp edges. */
export const isBuilt = (tile: Tile) => BUILT.has(tile.terrain);

/** 1 at an edge, easing to 0 at `w`; its slope at the edge matches its mirror image, so lip and foot meet smoothly. */
const profile = (d: number, w: number) => (d >= w ? 0 : 1 - Math.sin((Math.PI / 2) * (d / w)));

/** The eight neighbours as [dx, dy]; bit k of an edge mask stands for AROUND[k]. */
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

/**
 * Which neighbours a tile's rim curves towards: higher natural ground (its foot rises),
 * lower land or the board's edge (its lip drops), and lower liquid (its bank drops a full step).
 */
function edgeMasks(map: MapFile, tile: Tile): { foot: number; lip: number; bank: number } {
  let foot = 0;
  let lip = 0;
  let bank = 0;
  AROUND.forEach(([dx, dy], k) => {
    const t = tileAt(map, tile.x + dx, tile.y + dy);
    if (!t) lip |= 1 << k;
    else if (t.height > tile.height) foot |= isBuilt(t) ? 0 : 1 << k;
    else if (t.height < tile.height) (isLiquid(t) ? (bank |= 1 << k) : (lip |= 1 << k));
  });
  return { foot, lip, bank };
}

/**
 * Distance from tile-local (u, v) to the nearest neighbour in `mask`, with corners between
 * two masked edges rounded at radius `w`. Depends only on the point and the heights around it,
 * so two equal-height tiles agree along their shared edge (no cracks).
 */
function edgeDistance(mask: number, u: number, v: number, w: number): number {
  let alongX = Infinity;
  let alongZ = Infinity;
  let diagonal = Infinity;
  for (let k = 0; k < AROUND.length; k++) {
    if (!(mask & (1 << k))) continue;
    const [dx, dy] = AROUND[k];
    const ex = dx < 0 ? u : dx > 0 ? 1 - u : 0;
    const ez = dy < 0 ? v : dy > 0 ? 1 - v : 0;
    if (dy === 0) alongX = Math.min(alongX, ex);
    else if (dx === 0) alongZ = Math.min(alongZ, ez);
    else diagonal = Math.min(diagonal, Math.hypot(ex, ez));
  }
  const sides = alongX < w && alongZ < w ? Math.max(0, w - Math.hypot(w - alongX, w - alongZ)) : Math.min(alongX, alongZ);
  return Math.min(sides, diagonal);
}

/**
 * Natural variation at a world point (in tiles): how wide the rounding is, and how the
 * one-step drop is split between lip and foot. Smooth noise, so it never varies per tile.
 */
export function shapeAt(seed: number, x: number, y: number): { width: number; lipDrop: number; footRise: number } {
  const width = RIM_WIDTH_MIN + (RIM_WIDTH_MAX - RIM_WIDTH_MIN) * valueNoise(seed ^ 0x51ed, x / VARIATION_SCALE, y / VARIATION_SCALE);
  const shift = RIM_DROP * BALANCE_SHIFT * (2 * valueNoise(seed ^ 0x7a3c, x / VARIATION_SCALE, y / VARIATION_SCALE) - 1);
  return { width, lipDrop: RIM_DROP + shift, footRise: FOOT_RISE - shift };
}

export interface SurfaceSample {
  /** World-y offset from the tile's flat top. */
  offset: number;
  /** 0..1, how far into a cliff's foot this point is (for ambient occlusion). */
  foot: number;
}

/**
 * Rounded surface of a tile at local (u, v) in [0, 1]: lips curve down towards lower
 * neighbours (and the map edge), feet curve up towards higher ones. A one-step change
 * becomes one seamless S-curve; taller cliffs keep a vertical face between lip and foot.
 * Banks curve a full step down towards lower water. Liquids and built ground stay flat,
 * and natural ground meets a wall without curving up into it. The rounding's width and
 * balance drift across the map (shapeAt) so it doesn't look machine-made.
 */
export function surfaceAt(map: MapFile, tile: Tile, u: number, v: number): SurfaceSample {
  return tileSurface(map, tile)(u, v);
}

/** surfaceAt for one tile, its neighbours looked up once: for sampling a tile many times. */
export function tileSurface(map: MapFile, tile: Tile): (u: number, v: number) => SurfaceSample {
  const { foot, lip, bank } = isLiquid(tile) || isBuilt(tile) ? { foot: 0, lip: 0, bank: 0 } : edgeMasks(map, tile);
  if (!(foot | lip | bank)) return () => ({ offset: 0, foot: 0 });
  return (u, v) => {
    const { width: w, lipDrop, footRise } = shapeAt(map.seed, tile.x + u, tile.y + v);
    const rise = profile(edgeDistance(foot, u, v, w), w);
    const drop = profile(edgeDistance(lip, u, v, w), w);
    const sink = profile(edgeDistance(bank, u, v, w), w);
    return { offset: footRise * rise - Math.max(lipDrop * drop, BANK_DROP * sink), foot: rise };
  };
}

/** True when no neighbour differs in height, so the tile top is a plain flat square. */
export function isFlat(map: MapFile, tile: Tile): boolean {
  if (isLiquid(tile) || isBuilt(tile)) return true;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(map, tile.x + dx, tile.y + dy);
      if (!t || t.height !== tile.height) return false;
    }
  }
  return true;
}
