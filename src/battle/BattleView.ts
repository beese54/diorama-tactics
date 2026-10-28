import * as THREE from 'three';
import { formation } from './formation';

/** The scene is laid out on a screen this many units tall, whatever the window's real size. */
export const DESIGN_H = 1080;
/** How tall a front-rank soldier's picture stands, in design units (its sword tip included). */
export const SOLDIER_H = 300;
/** The head's picture is drawn this much taller than a soldier's: a leader stands out. */
export const HEAD_SCALE = 1.08;

/** Pictures for one side of a battle: the head, and the soldier designs its soldiers take in turn. */
export interface SquadArt {
  head: string;
  soldier: readonly string[];
  soldiers: number;
}

/** A soft round shadow, dark in the middle and fading out, for under every fighter's feet. */
export function shadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(14, 24, 10, 0.78)');
  g.addColorStop(0.55, 'rgba(14, 24, 10, 0.42)');
  g.addColorStop(1, 'rgba(14, 24, 10, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The battle scene, drawn sharp at the screen's full resolution: its own canvas and renderer
 * (antialiased, at the device pixel ratio), smooth filtering with mipmaps, nothing of the
 * map's pixel pipeline. A painted backdrop fills the screen, and the two squads stand
 * facing each other on its ground, the attacker on the left.
 */
export class BattleView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly loader = new THREE.TextureLoader();
  private readonly backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private aspect = 16 / 9;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'battle';
    parent.appendChild(this.canvas);
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.backdrop.renderOrder = -1;
    this.scene.add(this.backdrop);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Loads a picture for the scene: smooth filtering with mipmaps, at full quality. */
  texture(url: string): Promise<THREE.Texture> {
    return this.loader.loadAsync(url).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return t;
    });
  }

  /** Sizes the canvas to the window at the device's pixel ratio, and the camera to DESIGN_H units tall. */
  private resize(): void {
    const [w, h] = [window.innerWidth, window.innerHeight];
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    this.aspect = w / h;
    const halfW = (DESIGN_H * this.aspect) / 2;
    Object.assign(this.camera, { left: -halfW, right: halfW, top: DESIGN_H / 2, bottom: -DESIGN_H / 2 });
    this.camera.updateProjectionMatrix();
    this.fitBackdrop();
  }

  /** The backdrop covers the whole screen, cropped rather than stretched. */
  private fitBackdrop(): void {
    const image = this.backdrop.material.map?.image as { width: number; height: number } | undefined;
    const ratio = image ? image.width / image.height : 16 / 9;
    const screenW = DESIGN_H * this.aspect;
    const [w, h] = ratio > this.aspect ? [DESIGN_H * ratio, DESIGN_H] : [screenW, screenW / ratio];
    this.backdrop.scale.set(w, h, 1);
  }

  async setBackdrop(url: string): Promise<void> {
    this.backdrop.material.map = await this.texture(url);
    this.backdrop.material.needsUpdate = true;
    this.fitBackdrop();
  }

  /** Stands a squad on its side of the field: `left` for the attacker, facing right. */
  async setSquad(side: 'left' | 'right', art: SquadArt): Promise<void> {
    const [head, ...soldier] = await Promise.all([art.head, ...art.soldier].map((url) => this.texture(url)));
    const shadow = shadowTexture();
    const screenW = DESIGN_H * this.aspect;
    const dir = side === 'left' ? -1 : 1;
    for (const place of formation(art.soldiers)) {
      const tex = place.fighter === 0 ? head : soldier[(place.fighter - 1) % soldier.length];
      const { width, height } = tex.image as { width: number; height: number };
      const h = SOLDIER_H * place.scale * (place.fighter === 0 ? HEAD_SCALE : 1);
      const w = (h * width) / height;
      const x = dir * place.x * screenW;
      const feet = DESIGN_H / 2 - place.y * DESIGN_H;
      // Farther ranks take a touch of the sky's haze.
      const haze = 1 - (1 - place.scale) * 0.35;
      const figure = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, color: new THREE.Color(haze, haze, haze * 1.02) }),
      );
      // The art faces right; the right-hand squad is mirrored to face left.
      figure.scale.set(side === 'left' ? w : -w, h, 1);
      figure.position.set(x, feet, 0);
      figure.renderOrder = Math.round(place.y * 1000) + 1;
      const foot = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadow, transparent: true, depthTest: false }),
      );
      foot.scale.set(h * 0.85, h * 0.12, 1);
      foot.position.set(x - dir * h * 0.05, feet - h * 0.012, 0);
      foot.renderOrder = Math.round(place.y * 1000);
      this.scene.add(foot, figure);
    }
  }

  /** The screen's width in design units (its height is always DESIGN_H). */
  get width(): number {
    return DESIGN_H * this.aspect;
  }

  /** Shifts the view by a few design units (a screen shake); (0, 0) puts it back. */
  nudge(x: number, y: number): void {
    this.camera.position.set(x, y, 0);
  }

  /** Puts objects of the caller's own into the scene (an animation test's figures). */
  add(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
