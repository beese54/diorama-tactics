import * as THREE from 'three';
import { valueNoise } from '../util/noise';
import { mulberry32 } from '../util/rng';
import type { GroundImage } from './ground';
import { TERRAIN } from './terrain';
import { TILE_PX } from './textures';
import { TERRAIN_IDS, type MapFile, type Tile } from './types';

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

/** World size of a sprite: one texel per ground texel, like everything else on the map. */
const PLANT_W = SPRITE_W / TILE_PX;
const PLANT_H = SPRITE_H / TILE_PX;

/** Places tried per grass tile; how many become plants depends on the terrain and the clustering noise. */
const CANDIDATES = 6;

/** Wind: direction (world xz), a wave that travels with it, slower gusts, and a per-plant flutter. All periods divide 4 s, so the motion loops. */
const WIND_DIR = new THREE.Vector2(1, 0.35).normalize();
const WIND_PERIOD = 2;
const WIND_WAVELENGTH = 7;
const GUST_PERIOD = 4;
const GUST_WAVELENGTH = 16;
const FLUTTER_PERIOD = 1;
/** How far a plant's tip leans at full gust, in world units (~2 px). */
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

const f = (n: number) => n.toFixed(5);

/**
 * Upright billboard (turns to face the camera, stays vertical), then leans with the wind:
 * the tip bends most, a wave of lean travels across the field, gusts swell and fade, and
 * each plant flutters a little on its own phase.
 */
const SWAY_VERTEX = /* glsl */ `
  vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  vec2 windDir = vec2(${f(WIND_DIR.x)}, ${f(WIND_DIR.y)});
  float along = dot(position.xz, windDir);
  float bend = corner.y / ${f(PLANT_H)};
  bend *= bend;
  float wave = 0.5 + 0.5 * sin(6.2831853 * (uTime / ${f(WIND_PERIOD)} - along / ${f(WIND_WAVELENGTH)}));
  float gust = 0.6 + 0.4 * sin(6.2831853 * (uTime / ${f(GUST_PERIOD)} - along / ${f(GUST_WAVELENGTH)}));
  float flutter = sin(6.2831853 * (uTime / ${f(FLUTTER_PERIOD)} + phase));
  float sway = ${f(SWAY)} * bend * (gust * wave + 0.25 * flutter);
  vec3 transformed = position + camRight * corner.x + vec3(0.0, corner.y, 0.0);
  transformed.xz += windDir * sway;
`;

/** Flowers and grass tufts on the map, swaying in the wind. One draw call. */
export class Flora {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly time = { value: 0 };

  constructor(plants: Plant[], surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3) {
    const positions: number[] = [];
    const corners: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];
    const phases: number[] = [];
    const indices: number[] = [];
    plants.forEach((plant, i) => {
      const root = surfacePoint(plant.tile, plant.u, plant.v);
      const u0 = plant.sprite / SPRITE_COUNT;
      const u1 = (plant.sprite + 1) / SPRITE_COUNT;
      const quad: [number, number, number, number][] = [
        [-PLANT_W / 2, 0, u0, 0],
        [PLANT_W / 2, 0, u1, 0],
        [PLANT_W / 2, PLANT_H, u1, 1],
        [-PLANT_W / 2, PLANT_H, u0, 1],
      ];
      for (const [cx, cy, u, v] of quad) {
        positions.push(root.x, root.y, root.z);
        corners.push(cx, cy);
        uvs.push(u, v);
        normals.push(0, 1, 0); // lit like the ground it stands on
        phases.push(plant.phase);
      }
      indices.push(4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3);
    });
    this.count = plants.length;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
    geometry.setIndex(indices);

    const material = new THREE.MeshLambertMaterial({ map: spriteSheet(), alphaTest: 0.5, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader =
        'uniform float uTime;\nattribute vec2 corner;\nattribute float phase;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', SWAY_VERTEX);
    };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false; // vertices move in the shader; positions are only the roots
    this.group.add(mesh);
  }

  update(elapsed: number): void {
    this.time.value = elapsed;
  }
}
