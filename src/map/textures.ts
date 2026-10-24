import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { SIDE_STYLES, TERRAIN, type SideStyle } from './terrain';
import { TERRAIN_IDS, type TerrainId } from './types';

export const TILE_PX = 16;
/** One height step is half a tile tall, so its side face is 8 px. */
export const STEP_PX = 8;
/** Cliff-face texture variants painted per material, so neighbouring steps don't repeat. */
export const VARIANTS = 4;

type Rand = () => number;
type Ctx = CanvasRenderingContext2D;

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function pick<T>(items: readonly T[], rand: Rand): T {
  return items[Math.floor(rand() * items.length)];
}

const int = (rand: Rand, n: number) => Math.floor(rand() * n);

/** Cliff-face colours per material: [base, dark, light, accent]. */
const SIDE_PALETTES: Record<SideStyle, readonly string[]> = {
  soil: ['#7a5a3a', '#6a4c31', '#836240', '#9a8a72'],
  rock: ['#7c7466', '#655d51', '#8a8273', '#4b443b'],
  sand: ['#c9b682', '#b9a571', '#d6c597', '#a8935f'],
  redrock: ['#a86e48', '#8e5a3a', '#b98058', '#7a4a30'],
};

/** One 16x8 cliff-face cell: horizontal strata with speckle, cracks/pebbles as accents. */
function paintSide(ctx: Ctx, rand: Rand, style: SideStyle): void {
  const [base, dark, light, accent] = SIDE_PALETTES[style];
  for (let y = 0; y < STEP_PX; y++) {
    // Alternate strata bands; red rock gets bolder banding.
    const band = style === 'redrock' ? (y < 3 ? light : y < 5 ? base : dark) : y % 4 === 3 ? dark : base;
    for (let x = 0; x < TILE_PX; x++) {
      const r = rand();
      ctx.fillStyle = r < 0.2 ? dark : r < 0.35 ? light : band;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = accent;
    ctx.fillRect(int(rand, TILE_PX), int(rand, STEP_PX), 1, style === 'rock' ? 2 : 1);
  }
}

/** Grass/snow/etc. overhang along the top of a column's highest step. */
function paintLip(ctx: Ctx, rand: Rand, palette: readonly string[]): void {
  for (let x = 0; x < TILE_PX; x++) {
    ctx.fillStyle = pick(palette.slice(0, 2), rand);
    ctx.fillRect(x, 0, 1, 2);
    if (rand() < 0.45) ctx.fillRect(x, 2, 1, 1);
  }
}

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface TerrainAtlas {
  texture: THREE.CanvasTexture;
  /** Highest cliff step of a column: material plus the terrain's overhanging lip. */
  sideTop(terrain: TerrainId, variant: number): UvRect;
  /** Any lower cliff step: bare material. */
  sideLower(style: SideStyle, variant: number): UvRect;
}

/**
 * One canvas holding every cliff-face texture, so all sides draw in one call.
 * Columns = variants. Rows: terrain top-step sides (8 px), then lower-step sides per
 * material (8 px). Tile tops are painted map-wide instead (see ground.ts).
 */
export function buildTerrainAtlas(): TerrainAtlas {
  const sideLowerY = TERRAIN_IDS.length * STEP_PX;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX * VARIANTS;
  canvas.height = sideLowerY + SIDE_STYLES.length * STEP_PX;
  const atlas = canvas.getContext('2d')!;

  const cell = document.createElement('canvas');
  cell.width = TILE_PX;
  cell.height = STEP_PX;
  const ctx = cell.getContext('2d')!;
  const blit = (x: number, y: number) => atlas.drawImage(cell, x, y);

  TERRAIN_IDS.forEach((id, row) => {
    const def = TERRAIN[id];
    for (let v = 0; v < VARIANTS; v++) {
      ctx.clearRect(0, 0, TILE_PX, STEP_PX);
      const rand = mulberry32(row * 977 + v * 31 + 5);
      paintSide(ctx, rand, def.side);
      paintLip(ctx, rand, def.palette);
      blit(v * TILE_PX, row * STEP_PX);
    }
  });

  SIDE_STYLES.forEach((style, row) => {
    for (let v = 0; v < VARIANTS; v++) {
      ctx.clearRect(0, 0, TILE_PX, STEP_PX);
      paintSide(ctx, mulberry32(row * 613 + v * 7 + 3), style);
      blit(v * TILE_PX, sideLowerY + row * STEP_PX);
    }
  });

  const W = canvas.width;
  const H = canvas.height;
  // CanvasTexture is flipped: canvas y = 0 is v = 1.
  const rect = (x: number, y: number): UvRect => ({
    u0: x / W,
    u1: (x + TILE_PX) / W,
    v0: 1 - (y + STEP_PX) / H,
    v1: 1 - y / H,
  });
  const terrainRow = new Map(TERRAIN_IDS.map((id, i) => [id, i]));
  const sideRow = new Map(SIDE_STYLES.map((s, i) => [s, i]));

  return {
    texture: toTexture(canvas),
    sideTop: (terrain, v) => rect(v * TILE_PX, terrainRow.get(terrain)! * STEP_PX),
    sideLower: (style, v) => rect(v * TILE_PX, sideLowerY + sideRow.get(style)! * STEP_PX),
  };
}
