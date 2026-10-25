import * as THREE from 'three';
import { valueNoise } from '../util/noise';
import { mulberry32 } from '../util/rng';
import type { GroundImage } from './ground';
import { TERRAIN } from './terrain';
import { TILE_PX } from './textures';
import { isLiquid } from './surface';
import { TERRAIN_IDS, tileAt, type MapFile, type Tile } from './types';
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
/** Wild decor on generated maps: reeds with brown heads, pebbles, and low bushes. */
const REEDS = [
  ['.h...', '.r.h.', '.r.r.', 'R.rr.', '.rRr.', '.rrr.'],
  ['...h.', '.h.r.', '.r.rR', '.rR.r', 'rr.r.', '.rrr.'],
];
const PEBBLES = [
  ['.....', '.....', '.....', '.....', '.pq..', 'pqqq.'],
  ['.....', '.....', '.....', '..p..', '.pq.p', '.qq.q'],
];
const BUSH = ['.....', '.....', '.LgL.', 'LgggL', 'gdgdg', '.ggg.'];
const WILD: Record<string, string> = {
  r: '#6f8a46', R: '#93ab5c', h: '#6a4528', p: '#9d978c', q: '#6c675e', g: '#3f6a2e', L: '#5d8a3c', d: '#2f5226',
};

/** Sprite index layout: blooms per species, buds per species, tufts, then the wild decor. */
const BLOOMS_AT = 0;
const BUDS_AT = FLOWERS.length;
const TUFTS_AT = 2 * FLOWERS.length;
const REEDS_AT = TUFTS_AT + TUFTS.length;
const PEBBLES_AT = REEDS_AT + REEDS.length;
const BUSH_AT = PEBBLES_AT + PEBBLES.length;
const SPRITE_COUNT = BUSH_AT + 1;

/** Ground that grows reeds, and ground that sheds pebbles. */
const WETLAND = new Set(['marsh', 'swamp', 'bog']);
const ROCKY = new Set(['scree', 'mountain', 'badlands', 'hills']);
/** How far from the water's edge reeds grow on a bank, in tiles. */
const REED_REACH = 0.3;

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
  /** Pebbles don't sway. */
  still?: boolean;
}

const grassy = (style: string) => style === 'grass' || style === 'flowers';
/** What a plant is, from its sprite. */
export function plantKind(p: Plant): 'flower' | 'tuft' | 'reed' | 'pebble' | 'bush' {
  return p.sprite < TUFTS_AT ? 'flower' : p.sprite < REEDS_AT ? 'tuft' : p.sprite < PEBBLES_AT ? 'reed' : p.sprite < BUSH_AT ? 'pebble' : 'bush';
}

const stretch = (n: number) => Math.min(1, Math.max(0, (n - 0.5) * 1.8 + 0.5));

/**
 * Where flowers and grass tufts grow: only on pixels actually painted as grass (so never on
 * a rock or forest patch that frays into a grass tile), dense in meadows and in scattered
 * clumps on plains and hills. Species cluster in drifts, as wildflowers do. With `wild`
 * (generated maps), reeds, pebbles and bushes too (see placeWildDecor). Deterministic.
 */
export function placeFlora(map: MapFile, ground: GroundImage, wild = false): Plant[] {
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
  return wild ? plants.concat(placeWildDecor(map, ground)) : plants;
}

/**
 * Low decor that is never cover: reeds in marsh, swamp and bog and along the water's edge
 * (never on sand), pebbles on rocky ground, and bushes in light woods. Each only on pixels
 * painted as its own tile's ground. Its own random stream, so the flowers stay as they were.
 */
function placeWildDecor(map: MapFile, ground: GroundImage): Plant[] {
  const rand = mulberry32(map.seed ^ 0xdec0);
  const plants: Plant[] = [];
  for (const tile of map.tiles) {
    const def = TERRAIN[tile.terrain];
    if (isLiquid(tile)) continue;
    // Edges of this tile that meet water, as (dx, dy).
    const shores = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => { const n = tileAt(map, tile.x + dx, tile.y + dy); return !!n && isLiquid(n) && TERRAIN[n.terrain].style === 'water'; });
    for (let i = 0; i < 6; i++) {
      const [u, v, roll, pick, phase] = [0.06 + 0.88 * rand(), 0.06 + 0.88 * rand(), rand(), rand(), rand()];
      const x = tile.x + u;
      const y = tile.y + v;
      if (TERRAIN_IDS[ground.material[Math.floor(y * TILE_PX) * ground.width + Math.floor(x * TILE_PX)]] !== tile.terrain) continue;
      const cluster = stretch(valueNoise(map.seed ^ 0x2ee0, x / 1.8, y / 1.8));
      const edge = Math.min(...shores.map(([dx, dy]) => (dx > 0 ? 1 - u : dx < 0 ? u : dy > 0 ? 1 - v : v)));
      let sprite = -1;
      if (WETLAND.has(tile.terrain) && roll < 0.5 * cluster) sprite = REEDS_AT;
      else if (shores.length && def.style !== 'sand' && edge < REED_REACH && roll < 0.7) sprite = REEDS_AT;
      else if (ROCKY.has(tile.terrain) && roll < 0.12 * cluster) sprite = PEBBLES_AT;
      else if (tile.terrain === 'light_woods' && roll < 0.25 * cluster) sprite = BUSH_AT;
      if (sprite < 0) continue;
      const variant = sprite === BUSH_AT ? 0 : pick < 0.5 ? 0 : 1;
      plants.push({ tile, u, v, sprite: sprite + variant, phase, still: sprite === PEBBLES_AT });
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
  REEDS.forEach((rows, i) => draw(REEDS_AT + i, rows, WILD));
  PEBBLES.forEach((rows, i) => draw(PEBBLES_AT + i, rows, WILD));
  draw(BUSH_AT, BUSH, WILD);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Flowers, grass tufts and wild decor on the map, swaying in the wind. One draw call. */
export class Flora {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly field: SpriteField;

  constructor(plants: Plant[], surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3) {
    const rect = (sprite: number) => ({ u0: sprite / SPRITE_COUNT, u1: (sprite + 1) / SPRITE_COUNT, v0: 0, v1: 1, w: SPRITE_W, h: SPRITE_H });
    this.field = new SpriteField(
      plants.map((p) => ({ root: surfacePoint(p.tile, p.u, p.v), rect: rect(p.sprite), sway: p.still ? 0 : SWAY, phase: p.phase })),
      spriteSheet(),
    );
    this.count = this.field.count;
    this.group.add(this.field.group);
  }

  /** Settled snow (0-1) buries flowers and grass, a few at first and nearly all under deep snow. */
  setSnow(cover: number): void {
    this.field.setBury(Math.min(1, cover * 1.1));
  }

  /** Wind strength from the weather: 1 is a breeze. */
  setWind(strength: number): void {
    this.field.setWind(strength);
  }

  update(elapsed: number): void {
    this.field.update(elapsed);
  }
}
