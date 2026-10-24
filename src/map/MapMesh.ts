import * as THREE from 'three';
import { TERRAIN } from './terrain';
import { buildTerrainAtlas, TILE_PX, VARIANTS, type TerrainAtlas, type UvRect } from './textures';
import { tileAt, type MapFile, type Tile } from './types';
import { isFlat, isWater, RIM_DROP, SAMPLES, STEP_HEIGHT, surfaceAt } from './surface';
import type { GroundImage } from './ground';
import { WATER_FPS } from './water';

/** Depth of the diorama base below height 0, in steps. */
const BASE_STEPS = 4;

type Vec2 = [number, number];
/** Material groups of the merged mesh: tile tops sample the ground image, cliff faces the atlas. */
const TOP_LAYER = 0;
const SIDE_LAYER = 1;
type Layer = typeof TOP_LAYER | typeof SIDE_LAYER;
type Vec3 = [number, number, number];

/**
 * Cliff faces, one per neighbour direction. `a`/`b` are the face's top corners
 * (relative to the tile's NW corner), left-to-right as seen from outside.
 */
const SIDES: { dx: number; dy: number; normal: Vec3; a: Vec2; b: Vec2 }[] = [
  { dx: 0, dy: -1, normal: [0, 0, -1], a: [1, 0], b: [0, 0] }, // north
  { dx: 0, dy: 1, normal: [0, 0, 1], a: [0, 1], b: [1, 1] }, // south
  { dx: 1, dy: 0, normal: [1, 0, 0], a: [1, 1], b: [1, 0] }, // east
  { dx: -1, dy: 0, normal: [-1, 0, 0], a: [0, 0], b: [0, 1] }, // west
];

/** Darken cliff faces with depth below the column top, like soft ambient occlusion. */
const shadeAt = (depth: number) => Math.max(0.45, 1 - depth * 0.16);
/** How much the ground darkens where it curves up into a cliff's foot. */
const FOOT_SHADE = 0.3;
/** Finite-difference step for surface normals. */
const NORMAL_EPS = 1 / 64;
const EPS = 1e-6;

/** A tile's outline through every edge sample, clockwise from the north-west corner (as seen from above). */
const FLAT_RIM: Vec2[] = (() => {
  const back = [...SAMPLES].reverse();
  return [
    ...SAMPLES.map((s): Vec2 => [s, 0]),
    ...SAMPLES.slice(1).map((s): Vec2 => [1, s]),
    ...back.slice(1).map((s): Vec2 => [s, 1]),
    ...back.slice(1, -1).map((s): Vec2 => [0, s]),
  ];
})();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Stable per-face texture variant so neighbouring cliff steps don't repeat. */
function variantHash(x: number, y: number, step: number, side: number): number {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(step + 9, 83492791) ^ Math.imul(side + 1, 2654435761);
  h ^= h >>> 13;
  return (h >>> 0) % VARIANTS;
}

class GeometryBuilder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly colors: number[] = [];
  /** Per layer: triangle indices, and the tile each triangle belongs to (for picking). */
  private readonly indices: number[][] = [[], []];
  private readonly tiles: number[][] = [[], []];

  vertex(p: Vec3, n: Vec3, uv: Vec2, shade: number): number {
    this.positions.push(...p);
    this.normals.push(...n);
    this.uvs.push(...uv);
    this.colors.push(shade, shade, shade);
    return this.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number, tile: number, layer: Layer): void {
    this.indices[layer].push(a, b, c);
    this.tiles[layer].push(tile);
  }

  /** Corners in order top-left, top-right, bottom-right, bottom-left as seen from the front. */
  quad(corners: [Vec3, Vec3, Vec3, Vec3], normal: Vec3, uvs: [Vec2, Vec2, Vec2, Vec2], shades: [number, number, number, number], tile: number, layer: Layer): void {
    const [a, b, c, d] = corners.map((p, k) => this.vertex(p, normal, uvs[k], shades[k]));
    this.tri(a, d, b, tile, layer);
    this.tri(b, d, c, tile, layer);
  }

  /** Triangle index (layers in order, as in the built index buffer) -> tile index. */
  triangleTile(): Uint32Array {
    return Uint32Array.from(this.tiles.flat());
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices.flat());
    let start = 0;
    this.indices.forEach((layer, material) => {
      g.addGroup(start, layer.length, material);
      start += layer.length;
    });
    return g;
  }
}

/**
 * The whole map as one merged mesh of stepped columns with rounded edges (see surface.ts),
 * in two draw calls: tile tops sample the map-wide ground image (see ground.ts), whose water
 * animates by swapping frames; cliff faces use the side atlas. Cliff faces fill the gap
 * between a column's edge and its lower neighbour's (or the diorama base at the map edge).
 */
export class MapMesh {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly triangleTile: Uint32Array;
  private readonly groundTexture: THREE.DataTexture;
  private frame = 0;

  constructor(
    private readonly map: MapFile,
    private readonly ground: GroundImage,
  ) {
    const atlas = buildTerrainAtlas();
    const b = new GeometryBuilder();
    map.tiles.forEach((tile, i) => {
      this.buildTop(b, tile, i, this.groundRect(tile));
      this.buildSides(b, tile, i, atlas);
    });
    this.triangleTile = b.triangleTile();

    this.groundTexture = new THREE.DataTexture(ground.frames[0], ground.width, ground.height);
    this.groundTexture.colorSpace = THREE.SRGBColorSpace;
    this.groundTexture.needsUpdate = true;
    this.mesh = new THREE.Mesh(b.build(), [
      new THREE.MeshLambertMaterial({ map: this.groundTexture, vertexColors: true }),
      new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }),
    ]);
    this.group.add(this.mesh);
  }

  /** Advances the water loop to the frame for `elapsed` seconds. */
  update(elapsed: number): void {
    const frame = Math.floor(elapsed * WATER_FPS) % this.ground.frames.length;
    if (frame === this.frame) return;
    this.frame = frame;
    this.groundTexture.image.data = this.ground.frames[frame];
    this.groundTexture.needsUpdate = true;
  }

  /** Index of the water frame on screen (for headless checks). */
  get waterFrame(): number {
    return this.frame;
  }

  /**
   * A tile's window onto the ground image. The image's rows run north to south and data
   * textures aren't flipped, so v grows southward: v1 is the tile's north edge.
   */
  private groundRect(tile: Tile): UvRect {
    const { width: W, height: H } = this.ground;
    return {
      u0: (tile.x * TILE_PX) / W,
      u1: ((tile.x + 1) * TILE_PX) / W,
      v0: ((tile.y + 1) * TILE_PX) / H,
      v1: (tile.y * TILE_PX) / H,
    };
  }

  private buildTop(b: GeometryBuilder, tile: Tile, index: number, uv: UvRect): void {
    const [x0, z0] = this.tileOrigin(tile);
    const topY = tile.height * STEP_HEIGHT;
    const uvAt = (u: number, v: number): Vec2 => [lerp(uv.u0, uv.u1, u), lerp(uv.v1, uv.v0, v)];

    if (isFlat(this.map, tile)) {
      // A fan whose rim has a vertex at every edge sample, matching rounded neighbours' edges
      // exactly: a plain quad would leave T-junctions there, which rasterise as pinholes.
      const flat = ([u, v]: Vec2) => b.vertex([x0 + u, topY, z0 + v], [0, 1, 0], uvAt(u, v), 1);
      const centre = flat([0.5, 0.5]);
      const rim = FLAT_RIM.map(flat);
      rim.forEach((p, k) => b.tri(centre, rim[(k + 1) % rim.length], p, index, TOP_LAYER));
      return;
    }

    // Rounded top: a grid draped over the surface, with smooth normals so the lips catch the light.
    const offset = (u: number, v: number) => surfaceAt(this.map, tile, clamp01(u), clamp01(v)).offset;
    const n = SAMPLES.length;
    const first = b.positions.length / 3;
    for (const v of SAMPLES) {
      for (const u of SAMPLES) {
        const s = surfaceAt(this.map, tile, u, v);
        const gu = (offset(u + NORMAL_EPS, v) - offset(u - NORMAL_EPS, v)) / (clamp01(u + NORMAL_EPS) - clamp01(u - NORMAL_EPS));
        const gv = (offset(u, v + NORMAL_EPS) - offset(u, v - NORMAL_EPS)) / (clamp01(v + NORMAL_EPS) - clamp01(v - NORMAL_EPS));
        const len = Math.hypot(gu, 1, gv);
        b.vertex([x0 + u, topY + s.offset, z0 + v], [-gu / len, 1 / len, -gv / len], uvAt(u, v), 1 - FOOT_SHADE * s.foot);
      }
    }
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const tl = first + j * n + i;
        b.tri(tl, tl + n, tl + 1, index, TOP_LAYER);
        b.tri(tl + 1, tl + n, tl + n + 1, index, TOP_LAYER);
      }
    }
  }

  /**
   * Faces towards lower-or-equal neighbours, wherever this tile's edge sits above theirs.
   * Textured in step-tall cells counted down from the rounded lip, so texel density stays constant.
   */
  private buildSides(b: GeometryBuilder, tile: Tile, index: number, atlas: TerrainAtlas): void {
    const [x0, z0] = this.tileOrigin(tile);
    const topY = tile.height * STEP_HEIGHT;
    const def = TERRAIN[tile.terrain];
    const cellTop = topY - (isWater(tile) ? 0 : RIM_DROP);

    SIDES.forEach((side, s) => {
      const nb = tileAt(this.map, tile.x + side.dx, tile.y + side.dy);
      if (nb && nb.height > tile.height) return;
      const edgePoint = (t: number) => {
        const u = lerp(side.a[0], side.b[0], t);
        const v = lerp(side.a[1], side.b[1], t);
        const top = topY + surfaceAt(this.map, tile, u, v).offset;
        const bottom = nb ? nb.height * STEP_HEIGHT + surfaceAt(this.map, nb, u - side.dx, v - side.dy).offset : -BASE_STEPS * STEP_HEIGHT;
        return { t, x: x0 + u, z: z0 + v, top, bottom };
      };
      type EdgePoint = ReturnType<typeof edgePoint>;
      const within = (y: number, e: EdgePoint) => Math.min(Math.max(y, e.bottom), e.top);

      for (let k = 0; k < SAMPLES.length - 1; k++) {
        const L = edgePoint(SAMPLES[k]);
        const R = edgePoint(SAMPLES[k + 1]);
        if (L.top - L.bottom < EPS && R.top - R.bottom < EPS) continue;
        const hi = Math.max(L.top, R.top);
        const lo = Math.min(L.bottom, R.bottom);
        for (let j = Math.floor((cellTop - hi) / STEP_HEIGHT); cellTop - j * STEP_HEIGHT > lo + EPS; j++) {
          const cHi = cellTop - j * STEP_HEIGHT;
          const cLo = cHi - STEP_HEIGHT;
          const [lt, lb, rt, rb] = [within(cHi, L), within(cLo, L), within(cHi, R), within(cLo, R)];
          if (lt - lb < EPS && rt - rb < EPS) continue;
          const step = tile.height - 1 - j;
          const variant = variantHash(tile.x, tile.y, step, s);
          // Below height 0 is the diorama's bedrock: plain earth whatever sits on top.
          const uv = j <= 0 ? atlas.sideTop(tile.terrain, variant) : atlas.sideLower(step < 0 ? 'soil' : def.side, variant);
          const uvAt = (t: number, y: number): Vec2 => [lerp(uv.u0, uv.u1, t), lerp(uv.v0, uv.v1, (y - cLo) / STEP_HEIGHT)];
          b.quad(
            [[L.x, lt, L.z], [R.x, rt, R.z], [R.x, rb, R.z], [L.x, lb, L.z]],
            side.normal,
            [uvAt(L.t, lt), uvAt(R.t, rt), uvAt(R.t, rb), uvAt(L.t, lb)],
            [shadeAt(topY - lt), shadeAt(topY - rt), shadeAt(topY - rb), shadeAt(topY - lb)],
            index,
            SIDE_LAYER,
          );
        }
      }
    });
  }

  /** World-space north-west corner of a tile; the map is centred on the origin. */
  tileOrigin(tile: Pick<Tile, 'x' | 'y'>): [number, number] {
    return [tile.x - this.map.width / 2, tile.y - this.map.height / 2];
  }

  tileCenter(tile: Tile): THREE.Vector3 {
    return this.surfacePoint(tile, 0.5, 0.5);
  }

  /** World-space point on a tile's rounded surface at local (u, v) in [0, 1]. */
  surfacePoint(tile: Tile, u: number, v: number): THREE.Vector3 {
    const [x0, z0] = this.tileOrigin(tile);
    return new THREE.Vector3(x0 + u, tile.height * STEP_HEIGHT + surfaceAt(this.map, tile, u, v).offset, z0 + v);
  }

  /** The first column the ray hits (top or cliff face), i.e. the one you can actually see. */
  pick(raycaster: THREE.Raycaster): Tile | null {
    const hit = raycaster.intersectObject(this.mesh, false)[0];
    if (!hit || hit.faceIndex == null) return null;
    return this.map.tiles[this.triangleTile[hit.faceIndex]];
  }
}
