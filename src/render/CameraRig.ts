import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BASE_HEIGHT, BASE_WIDTH } from './PixelPipeline';

/** Internal pixels per world unit at zoom 1: one 16 px texel per screen pixel. */
const PIXELS_PER_UNIT = 16;

export const ZOOM_RANGE = { min: 0.5, max: 3 } as const;
/** Polar angle from straight down-the-vertical, in degrees. */
export const POLAR_RANGE_DEG = { min: 25, max: 75 } as const;

/**
 * Free-orbit orthographic camera around the map.
 * Left-drag rotates, right-drag or WASD pans along the ground, wheel zooms.
 */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly controls: OrbitControls;

  constructor(domElement: HTMLElement, private readonly panLimit: number) {
    const halfW = BASE_WIDTH / PIXELS_PER_UNIT / 2;
    const halfH = BASE_HEIGHT / PIXELS_PER_UNIT / 2;
    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 400);

    // Classic isometric start: azimuth 45°, 30° above the horizon.
    const azimuth = THREE.MathUtils.degToRad(45);
    const elevation = THREE.MathUtils.degToRad(30);
    const distance = 100;
    this.camera.position.set(
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    );

    const controls = new OrbitControls(this.camera, domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.15;
    controls.screenSpacePanning = false;
    controls.minZoom = ZOOM_RANGE.min;
    controls.maxZoom = ZOOM_RANGE.max;
    controls.minPolarAngle = THREE.MathUtils.degToRad(POLAR_RANGE_DEG.min);
    controls.maxPolarAngle = THREE.MathUtils.degToRad(POLAR_RANGE_DEG.max);
    controls.keys = { LEFT: 'KeyA', UP: 'KeyW', RIGHT: 'KeyD', BOTTOM: 'KeyS' };
    controls.keyPanSpeed = 12;
    controls.listenToKeyEvents(window);
    controls.addEventListener('change', () => this.clampTarget());
    controls.update();
    this.controls = controls;
  }

  /** Keep the orbit centre over the map so you can't pan off into the void. */
  private clampTarget(): void {
    const t = this.controls.target;
    const clampedX = THREE.MathUtils.clamp(t.x, -this.panLimit, this.panLimit);
    const clampedZ = THREE.MathUtils.clamp(t.z, -this.panLimit, this.panLimit);
    if (clampedX !== t.x || clampedZ !== t.z || t.y !== 0) {
      const shift = new THREE.Vector3(clampedX - t.x, -t.y, clampedZ - t.z);
      t.add(shift);
      this.camera.position.add(shift);
    }
  }

  /** Jump to an orbit pose (azimuth from +z toward +x), optionally re-centred on a ground point. */
  setPose(azimuthDeg: number, polarDeg: number, zoom: number, target?: THREE.Vector3): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    if (target) this.controls.target.set(target.x, 0, target.z);
    const offset = new THREE.Vector3().setFromSphericalCoords(
      distance,
      THREE.MathUtils.degToRad(polarDeg),
      THREE.MathUtils.degToRad(azimuthDeg),
    );
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  update(): void {
    this.controls.update();
  }
}
