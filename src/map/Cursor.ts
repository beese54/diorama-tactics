import * as THREE from 'three';
import { TILE_PX } from './textures';

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Down-pointing arrow, 7x6 px, drawn row by row ('#' = fill, 'o' = outline). */
const ARROW = ['ooooooo', 'o#####o', 'oo###oo', ' oo#oo ', '  ooo  ', '   o   '];

/** FFT-style tile cursor: a flashing outline on the tile and a bobbing pointer above it. */
export class Cursor {
  readonly group = new THREE.Group();
  private readonly outline: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly pointer: THREE.Sprite;

  constructor() {
    const outlineTex = canvasTexture(TILE_PX, TILE_PX, (ctx) => {
      ctx.fillStyle = 'rgba(140, 190, 255, 0.28)';
      ctx.fillRect(0, 0, TILE_PX, TILE_PX);
      ctx.strokeStyle = '#eaf4ff';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, TILE_PX - 1, TILE_PX - 1);
    });
    this.outline = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: outlineTex, transparent: true, depthWrite: false }),
    );
    this.outline.rotation.x = -Math.PI / 2;
    this.outline.position.y = 0.01;

    const arrowTex = canvasTexture(ARROW[0].length, ARROW.length, (ctx) => {
      ARROW.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          if (ch === ' ') return;
          ctx.fillStyle = ch === '#' ? '#ffe27a' : '#3a2a10';
          ctx.fillRect(x, y, 1, 1);
        });
      });
    });
    this.pointer = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowTex, depthTest: false }));
    this.pointer.scale.set(ARROW[0].length / TILE_PX, ARROW.length / TILE_PX, 1);
    this.pointer.renderOrder = 10;

    this.group.add(this.outline, this.pointer);
    this.group.visible = false;
  }

  /** Place on a tile centre (world space) or hide with null. */
  setTarget(center: THREE.Vector3 | null): void {
    this.group.visible = center !== null;
    if (center) this.group.position.copy(center);
  }

  update(timeSeconds: number): void {
    this.outline.material.opacity = 0.6 + 0.4 * Math.sin(timeSeconds * 6);
    this.pointer.position.y = 0.75 + 0.08 * Math.sin(timeSeconds * 4);
  }
}
