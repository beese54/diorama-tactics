import { TERRAIN } from './terrain';
import { atlasLayout, VARIANTS, type AtlasLayout, type UvRect } from './atlasLayout';
import { tileAt, TILE_PX, type MapFile, type Tile } from './types';
import { isBuilt, isFlat, isLiquid, RIM_DROP, SAMPLES, STEP_HEIGHT, tileSurface } from './surface';
import { FALL_PATTERN_PX } from './waterfall';

// Geometry of the board's stepped columns, as plain arrays: no three.js and no DOM, so it can be built on workers.

/** Depth of the diorama base below height 0, in steps. */
const BASE_STEPS = 4;

type Vec2 = [number, number];
/** Material groups of the merged mesh: tile tops sample the ground image, cliff faces the atlas, falling water its own loop. */
const TOP_LAYER = 0;
const SIDE_LAYER = 1;
const FALL_LAYER = 2;
type Layer = typeof TOP_LAYER | typeof SIDE_LAYER | typeof FALL_LAYER;
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
  private readonly indices: number[][] = [[], [], []];
  private readonly tiles: number[][] = [[], [], []];

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

  /** The geometry as plain arrays, indices still per layer. */
  output(): ColumnData {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      uvs: Float32Array.from(this.uvs),
      colors: Float32Array.from(this.colors),
      indices: this.indices.map((layer) => Uint32Array.from(layer)),
      tiles: this.tiles.map((layer) => Uint32Array.from(layer)),
    };
  }
}

/**
 * Geometry of some of the board's columns as plain arrays: vertices, and per material layer
 * the triangles' vertex indices and the tile each triangle belongs to (for picking).
 */
export interface ColumnData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array[];
  tiles: Uint32Array[];
}

/**
 * Builds the geometry of the columns of tiles [from, to): rounded tops and cliff faces. Each
 * tile depends only on the map, so runs of tiles can be built apart (on workers) and joined
 * with joinColumns into exactly what building them all at once gives.
 */
export function buildColumnRange(map: MapFile, from = 0, to = map.tiles.length): ColumnData {
  const atlas = atlasLayout();
  const b = new GeometryBuilder();
  for (let i = from; i < to; i++) {
    const tile = map.tiles[i];
    buildTop(map, b, tile, i, groundRect(map, tile));
    buildSides(map, b, tile, i, atlas);
  }
  return b.output();
}

/** Joins runs of columns built in tile order into one, as if built together. */
export function joinColumns(parts: readonly ColumnData[]): ColumnData {
  const join = (arrays: Float32Array[]) => {
    const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    arrays.reduce((at, a) => (out.set(a, at), at + a.length), 0);
    return out;
  };
  const vertexStart = parts.map((_, k) => parts.slice(0, k).reduce((n, p) => n + p.positions.length / 3, 0));
  const layers = parts[0].indices.map((_, layer) => {
    const indices = new Uint32Array(parts.reduce((n, p) => n + p.indices[layer].length, 0));
    const tiles = new Uint32Array(parts.reduce((n, p) => n + p.tiles[layer].length, 0));
    let at = 0;
    let tri = 0;
    parts.forEach((p, k) => {
      for (const v of p.indices[layer]) indices[at++] = v + vertexStart[k];
      tiles.set(p.tiles[layer], tri);
      tri += p.tiles[layer].length;
    });
    return { indices, tiles };
  });
  return {
    positions: join(parts.map((p) => p.positions)),
    normals: join(parts.map((p) => p.normals)),
    uvs: join(parts.map((p) => p.uvs)),
    colors: join(parts.map((p) => p.colors)),
    indices: layers.map((l) => l.indices),
    tiles: layers.map((l) => l.tiles),
  };
}

/** World-space north-west corner of a tile; the map is centred on the origin. */
export function tileOrigin(map: MapFile, tile: Pick<Tile, 'x' | 'y'>): [number, number] {
  return [tile.x - map.width / 2, tile.y - map.height / 2];
}

/**
 * A tile's window onto the ground image. The image's rows run north to south and data
 * textures aren't flipped, so v grows southward: v1 is the tile's north edge.
 */
function groundRect(map: MapFile, tile: Tile): UvRect {
  const [W, H] = [map.width * TILE_PX, map.height * TILE_PX];
  return {
    u0: (tile.x * TILE_PX) / W,
    u1: ((tile.x + 1) * TILE_PX) / W,
    v0: ((tile.y + 1) * TILE_PX) / H,
    v1: (tile.y * TILE_PX) / H,
  };
}

function buildTop(map: MapFile, b: GeometryBuilder, tile: Tile, index: number, uv: UvRect): void {
  const [x0, z0] = tileOrigin(map, tile);
  const topY = tile.height * STEP_HEIGHT;
  const uvAt = (u: number, v: number): Vec2 => [lerp(uv.u0, uv.u1, u), lerp(uv.v1, uv.v0, v)];

  if (isFlat(map, tile)) {
    // A fan whose rim has a vertex at every edge sample, matching rounded neighbours' edges
    // exactly: a plain quad would leave T-junctions there, which rasterise as pinholes.
    const flat = ([u, v]: Vec2) => b.vertex([x0 + u, topY, z0 + v], [0, 1, 0], uvAt(u, v), 1);
    const centre = flat([0.5, 0.5]);
    const rim = FLAT_RIM.map(flat);
    rim.forEach((p, k) => b.tri(centre, rim[(k + 1) % rim.length], p, index, TOP_LAYER));
    return;
  }

  // Rounded top: a grid draped over the surface, with smooth normals so the lips catch the light.
  const surface = tileSurface(map, tile);
  const offset = (u: number, v: number) => surface(clamp01(u), clamp01(v)).offset;
  const n = SAMPLES.length;
  const first = b.positions.length / 3;
  for (const v of SAMPLES) {
    for (const u of SAMPLES) {
      const s = surface(u, v);
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
function buildSides(map: MapFile, b: GeometryBuilder, tile: Tile, index: number, atlas: AtlasLayout): void {
  const [x0, z0] = tileOrigin(map, tile);
  const topY = tile.height * STEP_HEIGHT;
  const def = TERRAIN[tile.terrain];
  // Natural cliffs count their cells from the rounded lip; flat tops from the top itself.
  const cellTop = topY - (isLiquid(tile) || isBuilt(tile) ? 0 : RIM_DROP);
  const surface = tileSurface(map, tile);

  SIDES.forEach((side, s) => {
    const nb = tileAt(map, tile.x + side.dx, tile.y + side.dy);
    if (nb && nb.height > tile.height) return;
    // Water pouring onto lower water, or a river spilling off the board's edge.
    const below = nb && tileSurface(map, nb);
    const falls = !!tile.water && (nb ? !!nb.water && nb.height < tile.height : tile.water.kind === 'waterfall' && tile.water.flow[0] === side.dx && tile.water.flow[1] === side.dy);
    const edgePoint = (t: number) => {
      const u = lerp(side.a[0], side.b[0], t);
      const v = lerp(side.a[1], side.b[1], t);
      const top = topY + surface(u, v).offset;
      const bottom = nb && below ? nb.height * STEP_HEIGHT + below(u - side.dx, v - side.dy).offset : -BASE_STEPS * STEP_HEIGHT;
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
        if (falls) {
          // World-anchored, so the pattern runs unbroken down a fall of any height.
          const fallUv = (t: number, y: number): Vec2 => [t, (y * TILE_PX) / FALL_PATTERN_PX];
          b.quad([[L.x, lt, L.z], [R.x, rt, R.z], [R.x, rb, R.z], [L.x, lb, L.z]], side.normal,
            [fallUv(L.t, lt), fallUv(R.t, rt), fallUv(R.t, rb), fallUv(L.t, lb)], [1, 1, 1, 1], index, FALL_LAYER);
          continue;
        }
        const step = tile.height - 1 - j;
        const variant = variantHash(tile.x, tile.y, step, s);
        // Below height 0 is the diorama's bedrock: plain earth whatever sits on top.
        // The step just above the neighbour's ground is street level (shop fronts, doors).
        const uv =
          j <= 0 ? atlas.sideTop(tile.terrain, variant)
          : step < 0 ? atlas.sideLower('soil', variant)
          : step === nb?.height ? atlas.sideGround(def.side, variant)
          : atlas.sideLower(def.side, variant);
        // Clamped to the cell: where a rounded edge dips below it, a corner sits lower than the cell's
        // foot, and its texture must not reach into the next row of the atlas.
        const uvAt = (t: number, y: number): Vec2 => [lerp(uv.u0, uv.u1, t), lerp(uv.v0, uv.v1, clamp01((y - cLo) / STEP_HEIGHT))];
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
