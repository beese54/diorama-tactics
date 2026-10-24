import * as THREE from 'three';
import { fitPixelScale } from './pixelScale';

export const BASE_WIDTH = 480;
export const BASE_HEIGHT = 270;

/**
 * Renders at a fixed 480x270 drawing buffer and lets CSS upscale it by an integer
 * factor with `image-rendering: pixelated`, so every internal pixel stays a hard square.
 */
export class PixelPipeline {
  readonly renderer: THREE.WebGLRenderer;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(BASE_WIDTH, BASE_HEIGHT, false);
    container.appendChild(this.renderer.domElement);

    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private fit(): void {
    const { cssWidth, cssHeight } = fitPixelScale(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
      BASE_WIDTH,
      BASE_HEIGHT,
    );
    const style = this.renderer.domElement.style;
    style.width = `${cssWidth}px`;
    style.height = `${cssHeight}px`;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }
}
