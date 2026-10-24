import * as THREE from 'three';
import { buildTerrainAtlas, earthSide, VARIANTS } from './textures';
import type { MapFile, Tile } from './types';

/** Depth of the diorama base below the lowest tile, in height steps. */
const BASE_STEPS = 4;
const STEP_HEIGHT = 0.5;

/**
 * The whole map as one merged mesh (one draw call) using a terrain texture atlas,
 * standing on an earth-strata base like an FFT diorama.
 */
export class MapMesh {
  readonly group = new THREE.Group();
  private readonly tops: THREE.Mesh;
  /** Triangle index -> tile index, for picking. */
  private readonly triangleTile: Uint32Array;

  constructor(private readonly map: MapFile) {
    const atlas = buildTerrainAtlas();
    const count = map.tiles.length;
    const positions = new Float32Array(count * 4 * 3);
    const uvs = new Float32Array(count * 4 * 2);
    const normals = new Float32Array(count * 4 * 3);
    const indices = new Uint32Array(count * 6);
    this.triangleTile = new Uint32Array(count * 2);

    map.tiles.forEach((tile, i) => {
      const [x0, z0] = this.tileOrigin(tile);
      const y = tile.height * STEP_HEIGHT;
      const variant = Math.min(VARIANTS - 1, Math.floor(tile.seedRand * VARIANTS));
      const { u0, v0, u1, v1 } = atlas.uv(tile.terrain, variant);

      // Corners: NW, NE, SE, SW (north = -z). Texture top edge faces north.
      positions.set([x0, y, z0, x0 + 1, y, z0, x0 + 1, y, z0 + 1, x0, y, z0 + 1], i * 12);
      uvs.set([u0, v1, u1, v1, u1, v0, u0, v0], i * 8);
      normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], i * 12);
      const v = i * 4;
      indices.set([v, v + 3, v + 1, v + 1, v + 3, v + 2], i * 6);
      this.triangleTile[i * 2] = i;
      this.triangleTile[i * 2 + 1] = i;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.tops = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ map: atlas.texture }));
    this.group.add(this.tops);
    this.group.add(this.createBase());
  }

  /** World-space north-west corner of a tile; the map is centred on the origin. */
  tileOrigin(tile: Pick<Tile, 'x' | 'y'>): [number, number] {
    return [tile.x - this.map.width / 2, tile.y - this.map.height / 2];
  }

  tileCenter(tile: Tile): THREE.Vector3 {
    const [x0, z0] = this.tileOrigin(tile);
    return new THREE.Vector3(x0 + 0.5, tile.height * STEP_HEIGHT, z0 + 0.5);
  }

  pick(raycaster: THREE.Raycaster): Tile | null {
    const hit = raycaster.intersectObject(this.tops, false)[0];
    if (!hit || hit.faceIndex == null) return null;
    return this.map.tiles[this.triangleTile[hit.faceIndex]];
  }

  private createBase(): THREE.Mesh {
    const { width, height } = this.map;
    const depth = BASE_STEPS * STEP_HEIGHT;

    const alongX = earthSide(BASE_STEPS, 2);
    alongX.repeat.set(width, 1);
    const alongZ = earthSide(BASE_STEPS, 3);
    alongZ.repeat.set(height, 1);

    const sideX = new THREE.MeshLambertMaterial({ map: alongZ });
    const sideZ = new THREE.MeshLambertMaterial({ map: alongX });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const bottom = new THREE.MeshBasicMaterial({ color: 0x1a120c });

    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, depth, height), [
      sideX, sideX, hidden, bottom, sideZ, sideZ,
    ]);
    base.position.y = -depth / 2;
    return base;
  }
}
