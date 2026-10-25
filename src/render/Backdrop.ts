import * as THREE from 'three';
import { BASE_HEIGHT } from './PixelPipeline';

export interface BackdropLayers {
  /** The scenery: wraps horizontally, BASE_HEIGHT tall. */
  far: HTMLCanvasElement;
  /** Optional moving layer drawn over the scenery (clouds, mist, embers), tiled in both directions. */
  overlay?: {
    canvas: HTMLCanvasElement;
    /** Drift in px per second; it also turns with the camera like the scenery. */
    velocity: [number, number];
  };
}

/** How many screen pixels the scenery moves when the camera tilts by a degree. */
const TILT_PX_PER_DEG = 1.5;
/** Default camera tilt, at which the scenery sits exactly as painted. */
const REST_POLAR_DEG = 60;

function texture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Painted scenery behind the board, in the same pixel grid as everything else. A full-screen
 * layer drawn before the map: it slides sideways as the camera orbits (a full turn shows the
 * whole panorama) and a little up and down as it tilts. It never covers a tile.
 */
export class Backdrop {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly overlayVelocity: [number, number];

  constructor(layers: BackdropLayers) {
    const over = layers.overlay;
    this.uniforms = {
      farTex: { value: texture(layers.far) },
      farSize: { value: new THREE.Vector2(layers.far.width, layers.far.height) },
      overTex: { value: over ? texture(over.canvas) : null },
      overSize: { value: new THREE.Vector2(over?.canvas.width ?? 1, over?.canvas.height ?? 1) },
      hasOver: { value: over ? 1 : 0 },
      scroll: { value: new THREE.Vector2() },
      overScroll: { value: new THREE.Vector2() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D farTex;
        uniform vec2 farSize;
        uniform sampler2D overTex;
        uniform vec2 overSize;
        uniform float hasOver;
        uniform vec2 scroll;
        uniform vec2 overScroll;
        void main() {
          // Whole drawing-buffer pixels, counted from the top-left, so texels map one to one.
          vec2 px = vec2(floor(gl_FragCoord.x), ${BASE_HEIGHT.toFixed(1)} - 1.0 - floor(gl_FragCoord.y));
          vec2 p = px + scroll;
          p.y = clamp(p.y, 0.0, farSize.y - 1.0);
          vec4 color = texture2D(farTex, vec2((p.x + 0.5) / farSize.x, 1.0 - (p.y + 0.5) / farSize.y));
          if (hasOver > 0.5) {
            vec2 q = px + overScroll;
            vec4 o = texture2D(overTex, vec2((q.x + 0.5) / overSize.x, 1.0 - (q.y + 0.5) / overSize.y));
            color.rgb = mix(color.rgb, o.rgb, o.a);
          }
          gl_FragColor = vec4(color.rgb, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000; // before the map, which then draws over it
    this.overlayVelocity = over?.velocity ?? [0, 0];
  }

  /** Follows the camera's orbit (azimuth and polar angle, radians) and advances the overlay's drift. */
  update(elapsed: number, azimuth: number, polar: number): void {
    const farWidth = this.uniforms.farSize.value.x as number;
    const turn = Math.round((-azimuth / (2 * Math.PI)) * farWidth);
    // Looking more steeply down lifts the horizon off the top of the screen.
    const tilt = Math.round((REST_POLAR_DEG - THREE.MathUtils.radToDeg(polar)) * TILT_PX_PER_DEG);
    this.uniforms.scroll.value.set(turn, tilt);
    const [vx, vy] = this.overlayVelocity;
    this.uniforms.overScroll.value.set(turn - Math.round(vx * elapsed), tilt - Math.round(vy * elapsed));
  }
}
