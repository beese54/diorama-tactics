import * as THREE from 'three';
import { fitPixelScale } from './pixelScale';

export const BASE_WIDTH = 480;
export const BASE_HEIGHT = 270;

/**
 * Renders at a fixed 480x270 drawing buffer and lets CSS upscale it by an integer
 * factor with `image-rendering: pixelated`, so every internal pixel stays a hard square.
 * The stage element is sized to match and exposes `--px` (CSS px per internal pixel)
 * so HTML UI layered on top can scale in whole game pixels.
 */
export class PixelPipeline {
  readonly renderer: THREE.WebGLRenderer;

  constructor(private readonly stage: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(BASE_WIDTH, BASE_HEIGHT, false);
    stage.prepend(this.renderer.domElement);

    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const { scale, cssWidth, cssHeight } = fitPixelScale(
      window.innerWidth,
      window.innerHeight,
      dpr,
      BASE_WIDTH,
      BASE_HEIGHT,
    );
    for (const el of [this.stage, this.renderer.domElement]) {
      el.style.width = `${cssWidth}px`;
      el.style.height = `${cssHeight}px`;
    }
    this.stage.style.setProperty('--px', `${scale / dpr}px`);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }
}
