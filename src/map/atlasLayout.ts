import { SIDE_STYLES, type SideStyle } from './terrain';
import { TERRAIN_IDS, TILE_PX, type TerrainId } from './types';

/** One height step is half a tile tall, so its side face is 8 px. */
export const STEP_PX = 8;
/** Cliff-face texture variants painted per material, so neighbouring steps don't repeat. */
export const VARIANTS = 4;

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * Where every cliff face sits in the side atlas (textures.ts paints it). Columns = variants.
 * Rows: terrain top-step sides, then lower-step sides per material, then street-level sides
 * per material. Free of three.js and the DOM, so geometry can be built on a worker.
 */
export interface AtlasLayout {
  /** Atlas size in pixels, and the first row of the lower and street-level bands. */
  width: number;
  height: number;
  lowerY: number;
  groundY: number;
  /** Highest cliff step of a column: material plus the terrain's lip (natural) or coping (built). */
  sideTop(terrain: TerrainId, variant: number): UvRect;
  /** Any lower cliff step: bare material. */
  sideLower(style: SideStyle, variant: number): UvRect;
  /** The step just above the neighbouring ground: shop windows and doors on building fronts. */
  sideGround(style: SideStyle, variant: number): UvRect;
}

export function atlasLayout(): AtlasLayout {
  const lowerY = TERRAIN_IDS.length * STEP_PX;
  const groundY = lowerY + SIDE_STYLES.length * STEP_PX;
  const W = TILE_PX * VARIANTS;
  const H = groundY + SIDE_STYLES.length * STEP_PX;
  // The atlas is a CanvasTexture, which is flipped: canvas y = 0 is v = 1.
  const rect = (x: number, y: number): UvRect => ({
    u0: x / W,
    u1: (x + TILE_PX) / W,
    v0: 1 - (y + STEP_PX) / H,
    v1: 1 - y / H,
  });
  const terrainRow = new Map(TERRAIN_IDS.map((id, i) => [id, i]));
  const sideRow = new Map(SIDE_STYLES.map((s, i) => [s, i]));
  return {
    width: W,
    height: H,
    lowerY,
    groundY,
    sideTop: (terrain, v) => rect(v * TILE_PX, terrainRow.get(terrain)! * STEP_PX),
    sideLower: (style, v) => rect(v * TILE_PX, lowerY + sideRow.get(style)! * STEP_PX),
    sideGround: (style, v) => rect(v * TILE_PX, groundY + sideRow.get(style)! * STEP_PX),
  };
}
