import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { SIDE_STYLES, TERRAIN, type PaintStyle, type SideStyle } from './terrain';
import { TERRAIN_IDS, type MapFile, type TerrainId } from './types';
import { paintWater, WATER_PALETTE } from './water';

export const TILE_PX = 16;
/** One height step is half a tile tall, so its side face is 8 px. */
export const STEP_PX = 8;
/** Texture variants painted per terrain, chosen per tile by `seedRand`. */
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

function px(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x & (TILE_PX - 1), y & (TILE_PX - 1), 1, 1);
}

function speckle(ctx: Ctx, rand: Rand, colors: readonly string[]): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) px(ctx, x, y, pick(colors, rand));
  }
}

/** Pixel disc that wraps around tile edges so neighbouring tiles join up. */
function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + r * 0.5) px(ctx, cx + x, cy + y, color);
    }
  }
}

function treeClumps(ctx: Ctx, rand: Rand, p: readonly string[], count: number): void {
  for (let i = 0; i < count; i++) {
    const cx = int(rand, TILE_PX);
    const cy = int(rand, TILE_PX);
    disc(ctx, cx + 1, cy + 1, 3, p[0]); // shadow, lower right
    disc(ctx, cx, cy, 3, p[2]);
    px(ctx, cx - 1, cy - 1, p[3]); // sun highlight, upper left
    px(ctx, cx - 2, cy, p[3]);
  }
}

const PAINTERS: Record<PaintStyle, (ctx: Ctx, rand: Rand, p: readonly string[]) => void> = {
  grass(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 3));
    for (let i = 0; i < 6; i++) {
      const x = int(rand, TILE_PX);
      const y = int(rand, TILE_PX);
      px(ctx, x, y, p[3]);
      px(ctx, x, y + 1, p[3]);
    }
  },
  flowers(ctx, rand, p) {
    PAINTERS.grass(ctx, rand, p);
    for (let i = 0; i < 7; i++) px(ctx, int(rand, TILE_PX), int(rand, TILE_PX), pick(p.slice(4), rand));
  },
  rows(ctx, rand, p) {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const base = y % 4 < 2 ? p[0] : p[1];
        px(ctx, x, y, rand() < 0.15 ? p[2] : base);
      }
    }
  },
  cobble(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    for (let i = 0; i < 6; i++) {
      const x = int(rand, TILE_PX);
      const y = int(rand, TILE_PX);
      ctx.fillStyle = p[2];
      ctx.fillRect(x, y, 2, 2);
      px(ctx, x, y, p[3]);
    }
  },
  woods(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    treeClumps(ctx, rand, p, 2);
  },
  canopy(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    treeClumps(ctx, rand, p, 5);
  },
  rock(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    for (let c = 0; c < 2; c++) {
      let x = int(rand, TILE_PX);
      let y = int(rand, TILE_PX);
      for (let s = 0; s < 6; s++) {
        px(ctx, x, y, p[2]);
        x += rand() < 0.5 ? 1 : 0;
        y += 1;
      }
    }
    for (let i = 0; i < 5; i++) px(ctx, int(rand, TILE_PX), int(rand, TILE_PX), p[3]);
  },
  snow(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    for (let i = 0; i < 6; i++) px(ctx, int(rand, TILE_PX), int(rand, TILE_PX), p[2]);
  },
  swamp(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    disc(ctx, int(rand, TILE_PX), int(rand, TILE_PX), 2 + int(rand, 2), p[2]);
    for (let i = 0; i < 5; i++) {
      const x = int(rand, TILE_PX);
      const y = int(rand, TILE_PX);
      px(ctx, x, y, p[3]);
      px(ctx, x, y + 1, p[3]);
      if (rand() < 0.5) px(ctx, x, y + 2, p[3]);
    }
  },
  sand(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    const offset = int(rand, 8);
    for (let x = 0; x < TILE_PX; x++) {
      if ((x + offset) % 8 < 5) px(ctx, x, ((x + offset) >> 1) % TILE_PX, p[2]);
    }
  },
  water(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    for (let i = 0; i < 3; i++) {
      const x = int(rand, TILE_PX);
      const y = int(rand, TILE_PX);
      for (let k = 0; k < 3 + int(rand, 3); k++) px(ctx, x + k, y, p[2]);
    }
    for (let i = 0; i < 2; i++) px(ctx, int(rand, TILE_PX), int(rand, TILE_PX), p[3]);
  },
  crystal(ctx, rand, p) {
    speckle(ctx, rand, p.slice(0, 2));
    for (let i = 0; i < 3; i++) {
      const x = int(rand, TILE_PX);
      const y = int(rand, TILE_PX);
      px(ctx, x, y, p[3]);
      px(ctx, x, y + 1, p[2]);
      px(ctx, x, y + 2, p[2]);
      px(ctx, x + 1, y + 2, p[2]);
    }
  },
};

/** Subtle dark seam on the right and bottom edge, like FFT's tile grid. */
function seam(ctx: Ctx): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, TILE_PX - 1, TILE_PX, 1);
  ctx.fillRect(TILE_PX - 1, 0, 1, TILE_PX - 1);
}

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
  /** Tile top. */
  top(terrain: TerrainId, variant: number): UvRect;
  /** Highest cliff step of a column: material plus the terrain's overhanging lip. */
  sideTop(terrain: TerrainId, variant: number): UvRect;
  /** Any lower cliff step: bare material. */
  sideLower(style: SideStyle, variant: number): UvRect;
  /** Top of the water tile at map (x, y): its window onto the map-wide painted water. */
  water(x: number, y: number): UvRect;
}

/**
 * One canvas holding every texture the map needs, so the map draws in one call.
 * Columns = variants. Rows: terrain tops (16 px), then terrain top-step sides (8 px),
 * then lower-step sides per material (8 px), then the map's water painted as one image
 * (see water.ts) so its shades flow across tile boundaries.
 */
export function buildTerrainAtlas(map: MapFile): TerrainAtlas {
  const sideTopY = TERRAIN_IDS.length * TILE_PX;
  const sideLowerY = sideTopY + TERRAIN_IDS.length * STEP_PX;
  const waterY = sideLowerY + SIDE_STYLES.length * STEP_PX;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(TILE_PX * VARIANTS, map.width * TILE_PX);
  canvas.height = waterY + map.height * TILE_PX;
  const atlas = canvas.getContext('2d')!;

  const cell = document.createElement('canvas');
  cell.width = TILE_PX;
  cell.height = TILE_PX;
  const ctx = cell.getContext('2d')!;
  const blit = (x: number, y: number, h: number) => atlas.drawImage(cell, 0, 0, TILE_PX, h, x, y, TILE_PX, h);

  TERRAIN_IDS.forEach((id, row) => {
    const def = TERRAIN[id];
    for (let v = 0; v < VARIANTS; v++) {
      ctx.clearRect(0, 0, TILE_PX, TILE_PX);
      PAINTERS[def.style](ctx, mulberry32(row * 131 + v * 17 + 1), def.palette);
      seam(ctx);
      blit(v * TILE_PX, row * TILE_PX, TILE_PX);

      ctx.clearRect(0, 0, TILE_PX, TILE_PX);
      const rand = mulberry32(row * 977 + v * 31 + 5);
      paintSide(ctx, rand, def.side);
      paintLip(ctx, rand, def.palette);
      blit(v * TILE_PX, sideTopY + row * STEP_PX, STEP_PX);
    }
  });

  SIDE_STYLES.forEach((style, row) => {
    for (let v = 0; v < VARIANTS; v++) {
      ctx.clearRect(0, 0, TILE_PX, TILE_PX);
      paintSide(ctx, mulberry32(row * 613 + v * 7 + 3), style);
      blit(v * TILE_PX, sideLowerY + row * STEP_PX, STEP_PX);
    }
  });

  const water = paintWater(map, TILE_PX);
  const image = atlas.createImageData(water.width, water.height);
  const rgb = WATER_PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  water.index.forEach((c, i) => {
    if (c < 0) return;
    image.data.set([...rgb[c], 255], i * 4);
  });
  atlas.putImageData(image, 0, waterY);

  const W = canvas.width;
  const H = canvas.height;
  // CanvasTexture is flipped: canvas y = 0 is v = 1.
  const rect = (x: number, y: number, h: number): UvRect => ({
    u0: x / W,
    u1: (x + TILE_PX) / W,
    v0: 1 - (y + h) / H,
    v1: 1 - y / H,
  });
  const terrainRow = new Map(TERRAIN_IDS.map((id, i) => [id, i]));
  const sideRow = new Map(SIDE_STYLES.map((s, i) => [s, i]));

  return {
    texture: toTexture(canvas),
    top: (terrain, v) => rect(v * TILE_PX, terrainRow.get(terrain)! * TILE_PX, TILE_PX),
    sideTop: (terrain, v) => rect(v * TILE_PX, sideTopY + terrainRow.get(terrain)! * STEP_PX, STEP_PX),
    sideLower: (style, v) => rect(v * TILE_PX, sideLowerY + sideRow.get(style)! * STEP_PX, STEP_PX),
    water: (x, y) => rect(x * TILE_PX, waterY + y * TILE_PX, TILE_PX),
  };
}
