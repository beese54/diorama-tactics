import * as THREE from 'three';
import { valueNoise } from '../util/noise';
import { mulberry32 } from '../util/rng';
import type { GroundImage } from './ground';
import { TERRAIN } from './terrain';
import { TILE_PX } from './textures';
import { TERRAIN_IDS, type MapFile, type Tile } from './types';
import { SpriteField } from '../render/SpriteField';

/** Sprite cells, 5×6 px, standing on their bottom row. `.` is transparent. */
const SPRITE_W = 5;
const SPRITE_H = 6;
const BLOOM = ['..P..', '.PcP.', '..P..', '..s..', '.ls..', '..s..'];
const BUD = ['.....', '.....', '..P..', '..s..', '..sl.', '..s..'];
const TUFTS = [
  ['.....', '.....', '..L..', 'L.g.L', '.gLg.', '.ggg.'],
  ['.....', '.....', '.L...', '.g.L.', 'Lg.g.', '.ggg.'],
];
/** Petal and centre colours, one pair per flower species. */
const FLOWERS: readonly [string, string][] = [
  ['#e6cf5c', '#b8742e'], // buttercup
  ['#d68fa3', '#f2e6a0'], // pink campion
  ['#ece6d2', '#e6cf5c'], // daisy
  ['#a796d6', '#f2e6a0'], // violet
  ['#d0704e', '#f2e6a0'], // poppy
];
const GREENS: Record<string, string> = { s: '#4f6b38', l: '#5d7d48', g: '#5c7a3e', L: '#8aa35c' };

/** Sprite index layout: blooms per species, then buds per species, then tufts. */
const BLOOMS_AT = 0;
const BUDS_AT = FLOWERS.length;
const TUFTS_AT = 2 * FLOWERS.length;
const SPRITE_COUNT = TUFTS_AT + TUFTS.length;

/** Places tried per grass tile; how many become plants depends on the terrain and the clustering noise. */
const CANDIDATES = 6;

/** How far a plant's tip leans at full gust, in world units (~2 px); the wind itself lives in SpriteField. */
const SWAY = 0.12;

export interface Plant {
  tile: Tile;
  /** Tile-local position in [0, 1]. */
  u: number;
  v: number;
  sprite: number;
  /** Per-plant flutter phase in [0, 1). */
  phase: number;
}

const grassy = (style: string) => style === 'grass' || style === 'flowers';
const stretch = (n: number) => Math.min(1, Math.max(0, (n - 0.5) * 1.8 + 0.5));

/**
 * Where flowers and grass tufts grow: only on pixels actually painted as grass (so never on
 * a rock or forest patch that frays into a grass tile), dense in meadows and in scattered
 * clumps on plains and hills. Species cluster in drifts, as wildflowers do. Deterministic.
 */
export function placeFlora(map: MapFile, ground: GroundImage): Plant[] {
  const rand = mulberry32(map.seed ^ 0x5eed);
  const plants: Plant[] = [];
  for (const tile of map.tiles) {
    const style = TERRAIN[tile.terrain].style;
    if (!grassy(style)) continue;
    const meadow = style === 'flowers';
    for (let i = 0; i < CANDIDATES; i++) {
      const [u, v, roll, pick, phase] = [0.06 + 0.88 * rand(), 0.06 + 0.88 * rand(), rand(), rand(), rand()];
      const x = tile.x + u;
      const y = tile.y + v;
      const painted = TERRAIN_IDS[ground.material[Math.floor(y * TILE_PX) * ground.width + Math.floor(x * TILE_PX)]];
      if (!grassy(TERRAIN[painted].style)) continue;
      const cluster = stretch(valueNoise(map.seed ^ 0x4f1a, x / 2.2, y / 2.2));
      const bloom = meadow ? 0.3 + 0.6 * cluster : 0.3 * cluster * cluster;
      const tuft = meadow ? 0.25 : 0.35;
      let sprite: number;
      if (roll < bloom) {
        const drift = stretch(valueNoise(map.seed ^ 0x77c1, x / 1.6, y / 1.6)) * FLOWERS.length + (pick - 0.5) * 1.5;
        const species = Math.min(FLOWERS.length - 1, Math.max(0, Math.floor(drift)));
        sprite = (pick < 0.3 ? BUDS_AT : BLOOMS_AT) + species;
      } else if (roll < bloom + tuft) {
        sprite = TUFTS_AT + (pick < 0.5 ? 0 : 1);
      } else {
        continue;
      }
      plants.push({ tile, u, v, sprite, phase });
    }
  }
  return plants;
}

function spriteSheet(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_W * SPRITE_COUNT;
  canvas.height = SPRITE_H;
  const ctx = canvas.getContext('2d')!;
  const draw = (cell: number, rows: readonly string[], colors: Record<string, string>) =>
    rows.forEach((row, y) =>
      [...row].forEach((c, x) => {
        if (c === '.') return;
        ctx.fillStyle = colors[c];
        ctx.fillRect(cell * SPRITE_W + x, y, 1, 1);
      }),
    );
  FLOWERS.forEach(([petal, centre], i) => {
    draw(BLOOMS_AT + i, BLOOM, { ...GREENS, P: petal, c: centre });
    draw(BUDS_AT + i, BUD, { ...GREENS, P: petal });
  });
  TUFTS.forEach((rows, i) => draw(TUFTS_AT + i, rows, GREENS));

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Flowers and grass tufts on the map, swaying in the wind. One draw call. */
export class Flora {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly field: SpriteField;

  constructor(plants: Plant[], surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3) {
    const rect = (sprite: number) => ({ u0: sprite / SPRITE_COUNT, u1: (sprite + 1) / SPRITE_COUNT, v0: 0, v1: 1, w: SPRITE_W, h: SPRITE_H });
    this.field = new SpriteField(
      plants.map((p) => ({ root: surfacePoint(p.tile, p.u, p.v), rect: rect(p.sprite), sway: SWAY, phase: p.phase })),
      spriteSheet(),
    );
    this.count = this.field.count;
    this.group.add(this.field.group);
  }

  update(elapsed: number): void {
    this.field.update(elapsed);
  }
}
