import * as THREE from 'three';
import { fitPixelScale } from './pixelScale';

export const BASE_WIDTH = 480;
export const BASE_HEIGHT = 270;

/** Below this zoom a texel is smaller than a screen pixel, and the frame is supersampled so it doesn't shimmer. */
export const SUPERSAMPLE_BELOW = 0.5;
const MAX_SAMPLES = 4;

/**
 * Samples per pixel along each axis for a camera zoom: 1 from SUPERSAMPLE_BELOW up (drawn
 * straight to the screen, exactly as before), then enough that a texel spans about one sample.
 */
export function samplesFor(zoom: number): number {
  return zoom >= SUPERSAMPLE_BELOW ? 1 : Math.min(MAX_SAMPLES, Math.ceil(1 / zoom));
}

/**
 * Samples per pixel of the frame being drawn, for shaders that size things in drawing-buffer
 * pixels (points, the backdrop) so they keep their size when the frame is supersampled.
 */
export const pixelScale = { value: 1 };

/**
 * Renders at a fixed 480x270 drawing buffer and lets CSS upscale it by an integer
 * factor with `image-rendering: pixelated`, so every internal pixel stays a hard square.
 * The stage element is sized to match and exposes `--px` (CSS px per internal pixel)
 * so HTML UI layered on top can scale in whole game pixels.
 *
 * Zoomed far out, the frame is drawn at several samples per pixel and each block averaged
 * into one pixel, so distant texels blend instead of shimmering as the camera moves.
 */
export class PixelPipeline {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly average = new THREE.ShaderMaterial({
    uniforms: { frame: { value: null }, samples: { value: 1 } },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D frame;
      uniform int samples;
      void main() {
        ivec2 corner = ivec2(gl_FragCoord.xy) * samples;
        vec3 sum = vec3(0.0);
        for (int y = 0; y < ${MAX_SAMPLES}; y++) {
          if (y >= samples) break;
          for (int x = 0; x < ${MAX_SAMPLES}; x++) {
            if (x >= samples) break;
            sum += texelFetch(frame, corner + ivec2(x, y), 0).rgb;
          }
        }
        gl_FragColor = vec4(sum / float(samples * samples), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.average);
  private readonly screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(private readonly stage: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(BASE_WIDTH, BASE_HEIGHT, false);
    stage.prepend(this.renderer.domElement);
    this.screen.frustumCulled = false;

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

  /** Draws a frame, at `samples` per pixel along each axis (see samplesFor). */
  render(scene: THREE.Scene, camera: THREE.Camera, samples = 1): void {
    pixelScale.value = samples;
    if (samples === 1) {
      this.renderer.render(scene, camera);
      return;
    }
    const [width, height] = [BASE_WIDTH * samples, BASE_HEIGHT * samples];
    if (this.target?.width !== width) {
      this.target?.dispose();
      // Linear and half-float, so averaging happens in linear light and dark colours don't band.
      this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    }
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.average.uniforms.frame.value = this.target.texture;
    this.average.uniforms.samples.value = samples;
    this.renderer.render(this.screen, this.screenCamera);
  }
}
