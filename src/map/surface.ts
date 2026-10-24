import { TERRAIN } from './terrain';
import { tileAt, type MapFile, type Tile } from './types';

export const STEP_HEIGHT = 0.5;
/** How far in from an edge the rounding reaches, in tiles (4 texels). */
export const RIM_WIDTH = 0.25;
/** How far a column's lip curves down over a drop. */
export const RIM_DROP = 0.25;
/** How far the ground curves up into the foot of a rise. */
export const FOOT_RISE = 0.25;
/**
 * Sample positions across a tile (each axis): texel-spaced through the rims,
 * one span across the flat middle, which the rounding never reaches.
 */
export const SAMPLES = [0, 1 / 16, 2 / 16, 3 / 16, 4 / 16, 12 / 16, 13 / 16, 14 / 16, 15 / 16, 1];

export const isWater = (tile: Tile) => TERRAIN[tile.terrain].style === 'water';

/** 1 at an edge, easing to 0 at RIM_WIDTH; its slope at the edge matches its mirror image, so lip and foot meet smoothly. */
const profile = (d: number) => (d >= RIM_WIDTH ? 0 : 1 - Math.sin((Math.PI / 2) * (d / RIM_WIDTH)));

/**
 * Distance from tile-local (u, v) to the nearest neighbouring tile matching `outside`,
 * with corners between two outside edges rounded. Depends only on the point and the
 * heights around it, so two equal-height tiles agree along their shared edge (no cracks).
 */
function edgeDistance(map: MapFile, tile: Tile, u: number, v: number, outside: (t: Tile | undefined) => boolean): number {
  let alongX = Infinity;
  let alongZ = Infinity;
  let diagonal = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx === 0 && dy === 0) || !outside(tileAt(map, tile.x + dx, tile.y + dy))) continue;
      const ex = dx < 0 ? u : dx > 0 ? 1 - u : 0;
      const ez = dy < 0 ? v : dy > 0 ? 1 - v : 0;
      if (dy === 0) alongX = Math.min(alongX, ex);
      else if (dx === 0) alongZ = Math.min(alongZ, ez);
      else diagonal = Math.min(diagonal, Math.hypot(ex, ez));
    }
  }
  const w = RIM_WIDTH;
  const sides = alongX < w && alongZ < w ? Math.max(0, w - Math.hypot(w - alongX, w - alongZ)) : Math.min(alongX, alongZ);
  return Math.min(sides, diagonal);
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
 * Water stays flat.
 */
export function surfaceAt(map: MapFile, tile: Tile, u: number, v: number): SurfaceSample {
  if (isWater(tile)) return { offset: 0, foot: 0 };
  const foot = profile(edgeDistance(map, tile, u, v, (t) => !!t && t.height > tile.height));
  const lip = profile(edgeDistance(map, tile, u, v, (t) => !t || t.height < tile.height));
  return { offset: FOOT_RISE * foot - RIM_DROP * lip, foot };
}

/** True when no neighbour differs in height, so the tile top is a plain flat square. */
export function isFlat(map: MapFile, tile: Tile): boolean {
  if (isWater(tile)) return true;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(map, tile.x + dx, tile.y + dy);
      if (!t || t.height !== tile.height) return false;
    }
  }
  return true;
}
