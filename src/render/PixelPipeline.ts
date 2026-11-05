import * as THREE from 'three';
import { fitPixelScale } from './pixelScale';

/** The base frame: the view on a 1920x1080 screen, and what the map's opening zoom is measured against. */
export const BASE_WIDTH = 480;
export const BASE_HEIGHT = 270;

/**
 * The map's drawing size now, in internal pixels: the base frame on a 1920x1080 screen, and on
 * others whatever fills the window at the nearest whole pixel scale (see fitPixelScale). The
 * camera and the backdrop follow it.
 */
export const view = { width: BASE_WIDTH, height: BASE_HEIGHT };

/**
 * The camera layer drawn finer than the map (the detail preview's ?sprites=fine): a second pass at
 * `unitDensity` times the map's resolution, over the map and behind whatever stands in front.
 */
export const FINE_LAYER = 1;

/** Below this zoom a texel is smaller than a screen pixel, and the frame is supersampled so it doesn't shimmer. */
export const SUPERSAMPLE_BELOW = 0.5;
const MAX_SAMPLES = 4;

/**
 * Samples per pixel along each axis for a camera zoom: 1 from SUPERSAMPLE_BELOW up (drawn
 * straight to the screen, exactly as before), then about one sample per texel. Rounded, not
 * rounded up: a 64×64 board's widest view (zoom 0.31) takes 3×3 samples rather than 4×4,
 * barely more than a texel each, for little more than half the work on a laptop GPU.
 */
export function samplesFor(zoom: number): number {
  return zoom >= SUPERSAMPLE_BELOW ? 1 : Math.min(MAX_SAMPLES, Math.max(2, Math.round(1 / zoom)));
}

/**
 * Samples per pixel of the frame being drawn, for shaders that size things in drawing-buffer
 * pixels (points, the backdrop) so they keep their size when the frame is supersampled.
 */
export const pixelScale = { value: 1 };

/**
 * Renders at a small drawing buffer (`view`) and lets CSS upscale it by an integer factor with
 * `image-rendering: pixelated`, so every internal pixel stays a hard square, filling the window.
 * The stage element is sized to match and exposes `--px` (CSS px per internal pixel)
 * so HTML UI layered on top can scale in whole game pixels.
 *
 * Zoomed far out, the frame is drawn at several samples per pixel and each block averaged
 * into one pixel, so distant texels blend instead of shimmering as the camera moves.
 */
export class PixelPipeline {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget | null = null;
  /** With a fine pass: the map's frame and its depth, drawn at the map's resolution. */
  private coarse: THREE.WebGLRenderTarget | null = null;
  private readonly compose = new THREE.ShaderMaterial({
    uniforms: { frame: { value: null }, depth: { value: null }, samples: { value: 1 }, density: { value: 2 } },
    depthTest: true,
    depthFunc: THREE.AlwaysDepth,
    depthWrite: true,
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D frame;
      uniform sampler2D depth;
      uniform int samples;
      uniform int density;
      void main() {
        // Each map pixel covers density x density screen pixels; its colour is the average of its samples.
        ivec2 corner = (ivec2(gl_FragCoord.xy) / density) * samples;
        vec3 sum = vec3(0.0);
        float near = 1.0;
        for (int y = 0; y < ${MAX_SAMPLES}; y++) {
          if (y >= samples) break;
          for (int x = 0; x < ${MAX_SAMPLES}; x++) {
            if (x >= samples) break;
            sum += texelFetch(frame, corner + ivec2(x, y), 0).rgb;
            near = min(near, texelFetch(depth, corner + ivec2(x, y), 0).r);
          }
        }
        // The map's depth, so the fine pass is hidden behind hills and props as it would be in the map's own pass.
        gl_FragDepth = near;
        gl_FragColor = vec4(sum / float(samples * samples), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  private readonly composeScreen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compose);
  /** Drawing-buffer pixels per map pixel, each way: 1, or 2 with a fine pass. */
  readonly unitDensity: number;
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

  constructor(private readonly stage: HTMLElement, unitDensity = 1) {
    this.unitDensity = unitDensity;
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    stage.prepend(this.renderer.domElement);
    this.screen.frustumCulled = false;
    this.composeScreen.frustumCulled = false;

    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private fit(): void {
    const dpr = window.devicePixelRatio || 1;
    const { scale, width, height, cssWidth, cssHeight } = fitPixelScale(
      window.innerWidth,
      window.innerHeight,
      dpr,
      BASE_WIDTH,
      BASE_HEIGHT,
    );
    view.width = width;
    view.height = height;
    this.renderer.setSize(width * this.unitDensity, height * this.unitDensity, false);
    for (const el of [this.stage, this.renderer.domElement]) {
      el.style.width = `${cssWidth}px`;
      el.style.height = `${cssHeight}px`;
    }
    this.stage.style.setProperty('--px', `${scale / dpr}px`);
  }

  /** Draws a frame, at `samples` per pixel along each axis (see samplesFor). */
  render(scene: THREE.Scene, camera: THREE.Camera, samples = 1): void {
    if (this.unitDensity > 1) return this.renderFine(scene, camera, samples);
    pixelScale.value = samples;
    if (samples === 1) {
      this.renderer.render(scene, camera);
      return;
    }
    const [width, height] = [view.width * samples, view.height * samples];
    if (this.target?.width !== width || this.target.height !== height) {
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

  /**
   * The map at its own resolution (with its depth), spread over the finer drawing buffer, then the
   * fine layer drawn over it at the buffer's resolution, tested against the map's depth.
   */
  private renderFine(scene: THREE.Scene, camera: THREE.Camera, samples: number): void {
    pixelScale.value = samples;
    const [width, height] = [view.width * samples, view.height * samples];
    if (this.coarse?.width !== width || this.coarse.height !== height) {
      this.coarse?.dispose();
      this.coarse = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.HalfFloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType),
      });
    }
    this.renderer.setRenderTarget(this.coarse);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.compose.uniforms.frame.value = this.coarse.texture;
    this.compose.uniforms.depth.value = this.coarse.depthTexture;
    this.compose.uniforms.samples.value = samples;
    this.compose.uniforms.density.value = this.unitDensity;
    this.renderer.render(this.composeScreen, this.screenCamera);
    // The fine layer, lit by the same lights.
    scene.traverse((o) => (o as THREE.Light).isLight && o.layers.enable(FINE_LAYER));
    const mask = camera.layers.mask;
    camera.layers.set(FINE_LAYER);
    // A colour background clears the frame before drawing, whatever autoClear says: set it aside.
    const [autoClear, background] = [this.renderer.autoClear, scene.background];
    this.renderer.autoClear = false;
    scene.background = null;
    pixelScale.value = this.unitDensity;
    this.renderer.render(scene, camera);
    this.renderer.autoClear = autoClear;
    scene.background = background;
    camera.layers.mask = mask;
  }
}
