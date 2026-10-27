import * as THREE from 'three';
import { TILE_PX } from '../map/textures';
import type { Tile } from '../map/types';

/** Grid steps across a tile, enough to follow its rounded lips. */
const SEGMENTS = 4;

/** The kinds of mark: where the selected unit can go (blue, or red for an enemy's reach) and the path it would take. */
export type MarkKind = 'reach' | 'foe' | 'path';
const STYLE: Record<MarkKind, { fill: string; edge: string; opacity: number }> = {
  reach: { fill: 'rgba(90, 160, 255, 0.42)', edge: '#cfe6ff', opacity: 0.85 },
  foe: { fill: 'rgba(255, 96, 80, 0.4)', edge: '#ffd0c8', opacity: 0.85 },
  path: { fill: 'rgba(255, 214, 96, 0.62)', edge: '#fff4c4', opacity: 1 },
};

function markTexture(kind: MarkKind): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = STYLE[kind].fill;
  ctx.fillRect(1, 1, TILE_PX - 2, TILE_PX - 2);
  ctx.strokeStyle = STYLE[kind].edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, TILE_PX - 3, TILE_PX - 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Tiles marked on the board, FFT style: the selected unit's move range and the path to the
 * tile under the cursor, each a translucent panel draped over the tile's top.
 */
export class RangeLayer {
  readonly group = new THREE.Group();
  private readonly meshes: Record<MarkKind, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>;

  constructor(private readonly surfacePoint: (tile: Tile, u: number, v: number) => THREE.Vector3) {
    const make = (kind: MarkKind, order: number) => {
      const mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          map: markTexture(kind), transparent: true, opacity: STYLE[kind].opacity, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 - order,
        }),
      );
      mesh.renderOrder = 2 + order;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = { reach: make('reach', 0), foe: make('foe', 0), path: make('path', 1) };
  }

  /** Marks `tiles` as `kind`, replacing whatever that kind marked before. */
  mark(kind: MarkKind, tiles: readonly Tile[]): void {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (const tile of tiles) {
      const base = positions.length / 3;
      for (let j = 0; j <= SEGMENTS; j++) {
        for (let i = 0; i <= SEGMENTS; i++) {
          const [u, v] = [i / SEGMENTS, j / SEGMENTS];
          const p = this.surfacePoint(tile, u, v);
          positions.push(p.x, p.y + 0.012, p.z);
          uvs.push(u, 1 - v);
        }
      }
      for (let j = 0; j < SEGMENTS; j++) {
        for (let i = 0; i < SEGMENTS; i++) {
          const a = base + j * (SEGMENTS + 1) + i;
          indices.push(a, a + SEGMENTS + 1, a + 1, a + 1, a + SEGMENTS + 1, a + SEGMENTS + 2);
        }
      }
    }
    const mesh = this.meshes[kind];
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    mesh.geometry.setIndex(indices);
  }

  /** How many tiles each kind marks now (for checks). */
  count(kind: MarkKind): number {
    return (this.meshes[kind].geometry.index?.count ?? 0) / (6 * SEGMENTS * SEGMENTS);
  }

  /** A slow pulse, so the marks read as a choice to make rather than part of the ground. */
  update(elapsed: number): void {
    for (const kind of ['reach', 'foe'] as const) this.meshes[kind].material.opacity = STYLE[kind].opacity * (0.8 + 0.2 * Math.sin(elapsed * 3));
  }
}
