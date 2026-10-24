import * as THREE from 'three';
import { mulberry32 } from '../util/rng';
import { TERRAIN, type PaintStyle } from './terrain';
import { TERRAIN_IDS, type TerrainId } from './types';

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

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface TerrainAtlas {
  texture: THREE.CanvasTexture;
  uv(terrain: TerrainId, variant: number): UvRect;
}

/** One canvas holding every terrain top: rows = terrains, columns = variants. */
export function buildTerrainAtlas(): TerrainAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX * VARIANTS;
  canvas.height = TILE_PX * TERRAIN_IDS.length;
  const atlasCtx = canvas.getContext('2d')!;

  const cell = document.createElement('canvas');
  cell.width = TILE_PX;
  cell.height = TILE_PX;
  const ctx = cell.getContext('2d')!;

  TERRAIN_IDS.forEach((id, row) => {
    const def = TERRAIN[id];
    for (let v = 0; v < VARIANTS; v++) {
      ctx.clearRect(0, 0, TILE_PX, TILE_PX);
      PAINTERS[def.style](ctx, mulberry32(row * 131 + v * 17 + 1), def.palette);
      seam(ctx);
      atlasCtx.drawImage(cell, v * TILE_PX, row * TILE_PX);
    }
  });

  const rowOf = new Map(TERRAIN_IDS.map((id, i) => [id, i]));
  const du = 1 / VARIANTS;
  const dv = 1 / TERRAIN_IDS.length;
  return {
    texture: toTexture(canvas),
    uv(terrain, variant) {
      const row = rowOf.get(terrain)!;
      // CanvasTexture is flipped: canvas row 0 is at the top of v.
      return { u0: variant * du, u1: (variant + 1) * du, v0: 1 - (row + 1) * dv, v1: 1 - row * dv };
    },
  };
}

/** Earth strata for the diorama's cut-away edges, darkening with depth. */
export function earthSide(steps: number, seed = 2): THREE.CanvasTexture {
  const bands = [
    ['#7a5a3a', '#6e5034', '#836240'],
    ['#6a4c31', '#5f442c', '#735336'],
    ['#5a4029', '#4f3824', '#634630'],
    ['#4a3522', '#43301f', '#523a26'],
    ['#3a2a1b', '#332517', '#41301f'],
  ] as const;
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = STEP_PX * steps;
  const ctx = canvas.getContext('2d')!;
  const rand = mulberry32(seed);
  for (let y = 0; y < canvas.height; y++) {
    const band = bands[Math.min(bands.length - 1, Math.floor((y / canvas.height) * bands.length))];
    for (let x = 0; x < TILE_PX; x++) {
      ctx.fillStyle = pick(band, rand);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Pebbles in the soil.
  for (let i = 0; i < steps * 2; i++) {
    ctx.fillStyle = '#8a7a66';
    ctx.fillRect(int(rand, TILE_PX), int(rand, canvas.height), 1, 1);
  }
  return toTexture(canvas);
}
