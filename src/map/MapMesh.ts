import * as THREE from 'three';
import { TERRAIN } from './terrain';
import { buildTerrainAtlas, VARIANTS, type UvRect } from './textures';
import { tileAt, type MapFile, type Tile } from './types';

/** Depth of the diorama base below height 0, in steps. */
const BASE_STEPS = 4;
export const STEP_HEIGHT = 0.5;

type Vec3 = [number, number, number];

/**
 * Cliff faces, one per neighbour direction. `a`/`b` are the face's top corners
 * (relative to the tile's NW corner), left-to-right as seen from outside.
 */
const SIDES: { dx: number; dy: number; normal: Vec3; a: [number, number]; b: [number, number] }[] = [
  { dx: 0, dy: -1, normal: [0, 0, -1], a: [1, 0], b: [0, 0] }, // north
  { dx: 0, dy: 1, normal: [0, 0, 1], a: [0, 1], b: [1, 1] }, // south
  { dx: 1, dy: 0, normal: [1, 0, 0], a: [1, 1], b: [1, 0] }, // east
  { dx: -1, dy: 0, normal: [-1, 0, 0], a: [0, 0], b: [0, 1] }, // west
];

/** Darken cliff faces with depth below the column top, like soft ambient occlusion. */
const shadeAt = (depth: number) => Math.max(0.45, 1 - depth * 0.16);

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
  readonly indices: number[] = [];
  /** Triangle index -> tile index, for picking. */
  readonly triangleTile: number[] = [];

  /** Corners in order top-left, top-right, bottom-right, bottom-left as seen from the front. */
  quad(corners: [Vec3, Vec3, Vec3, Vec3], normal: Vec3, uv: UvRect, shade: [number, number], tile: number): void {
    const base = this.positions.length / 3;
    for (const c of corners) this.positions.push(...c);
    for (let i = 0; i < 4; i++) this.normals.push(...normal);
    this.uvs.push(uv.u0, uv.v1, uv.u1, uv.v1, uv.u1, uv.v0, uv.u0, uv.v0);
    const [top, bottom] = shade;
    this.colors.push(top, top, top, top, top, top, bottom, bottom, bottom, bottom, bottom, bottom);
    this.indices.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
    this.triangleTile.push(tile, tile);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.setIndex(this.indices);
    return g;
  }
}

/**
 * The whole map as one merged mesh (one draw call) of stepped columns, using a single
 * texture atlas. Only cliff faces exposed to a lower neighbour (or the map edge) are built;
 * edge columns run down into a diorama base below height 0.
 */
export class MapMesh {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly triangleTile: Uint32Array;

  constructor(private readonly map: MapFile) {
    const atlas = buildTerrainAtlas();
    const b = new GeometryBuilder();

    map.tiles.forEach((tile, i) => {
      const [x0, z0] = this.tileOrigin(tile);
      const topY = tile.height * STEP_HEIGHT;
      const def = TERRAIN[tile.terrain];
      const variant = Math.min(VARIANTS - 1, Math.floor(tile.seedRand * VARIANTS));

      b.quad(
        [[x0, topY, z0], [x0 + 1, topY, z0], [x0 + 1, topY, z0 + 1], [x0, topY, z0 + 1]],
        [0, 1, 0],
        atlas.top(tile.terrain, variant),
        [1, 1],
        i,
      );

      SIDES.forEach((side, s) => {
        const neighbour = tileAt(map, tile.x + side.dx, tile.y + side.dy);
        const lowest = neighbour ? neighbour.height : -BASE_STEPS;
        for (let step = tile.height - 1; step >= lowest; step--) {
          const yTop = (step + 1) * STEP_HEIGHT;
          const yBot = step * STEP_HEIGHT;
          const v = variantHash(tile.x, tile.y, step, s);
          // Below height 0 is the diorama's bedrock: plain earth whatever sits on top.
          const uv = step === tile.height - 1
            ? atlas.sideTop(tile.terrain, v)
            : atlas.sideLower(step < 0 ? 'soil' : def.side, v);
          const [ax, az] = [x0 + side.a[0], z0 + side.a[1]];
          const [bx, bz] = [x0 + side.b[0], z0 + side.b[1]];
          b.quad(
            [[ax, yTop, az], [bx, yTop, bz], [bx, yBot, bz], [ax, yBot, az]],
            side.normal,
            uv,
            [shadeAt(topY - yTop), shadeAt(topY - yBot)],
            i,
          );
        }
      });
    });

    this.triangleTile = Uint32Array.from(b.triangleTile);
    this.mesh = new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }));
    this.group.add(this.mesh);
  }

  /** World-space north-west corner of a tile; the map is centred on the origin. */
  tileOrigin(tile: Pick<Tile, 'x' | 'y'>): [number, number] {
    return [tile.x - this.map.width / 2, tile.y - this.map.height / 2];
  }

  tileCenter(tile: Tile): THREE.Vector3 {
    const [x0, z0] = this.tileOrigin(tile);
    return new THREE.Vector3(x0 + 0.5, tile.height * STEP_HEIGHT, z0 + 0.5);
  }

  /** The first column the ray hits (top or cliff face), i.e. the one you can actually see. */
  pick(raycaster: THREE.Raycaster): Tile | null {
    const hit = raycaster.intersectObject(this.mesh, false)[0];
    if (!hit || hit.faceIndex == null) return null;
    return this.map.tiles[this.triangleTile[hit.faceIndex]];
  }
}
