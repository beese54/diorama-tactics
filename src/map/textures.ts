import * as THREE from 'three';
import { mulberry32 } from '../util/rng';

export const TILE_PX = 16;
/** One height step is half a tile tall, so its side face is 8 px. */
export const STEP_PX = 8;

type Painter = (ctx: CanvasRenderingContext2D, rand: () => number) => void;

function pixelTexture(w: number, h: number, seed: number, paint: Painter): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, mulberry32(seed));

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function pick<T>(items: readonly T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

/** Muted FFT-style grass top with a subtle darker seam on two edges. */
export function grassTop(seed = 1): THREE.CanvasTexture {
  const palette = ['#6f8a4a', '#667f44', '#7a9552', '#5d7640'] as const;
  return pixelTexture(TILE_PX, TILE_PX, seed, (ctx, rand) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        ctx.fillStyle = pick(palette, rand);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = '#4d6435';
    ctx.fillRect(0, TILE_PX - 1, TILE_PX, 1);
    ctx.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
  });
}

/** Earth strata for one height step: grass lip on top, then banded soil. */
export function earthSide(seed = 2): THREE.CanvasTexture {
  const bands = [
    ['#5d7640', '#556d3b'],
    ['#7a5a3a', '#6e5034'],
    ['#7a5a3a', '#836240'],
    ['#6a4c31', '#5f442c'],
    ['#6a4c31', '#735336'],
    ['#5a4029', '#4f3824'],
    ['#5a4029', '#634630'],
    ['#4a3522', '#43301f'],
  ] as const;
  return pixelTexture(TILE_PX, STEP_PX, seed, (ctx, rand) => {
    for (let y = 0; y < STEP_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        ctx.fillStyle = pick(bands[y], rand);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}
